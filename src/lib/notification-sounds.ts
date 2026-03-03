"use client"

export type NotificationSoundKind =
    | "rental_indication"
    | "internal_chat"
    | "task_notification"

type SoundStep = {
    frequency: number
    durationSeconds: number
    volume?: number
    waveform?: OscillatorType
    gapSeconds?: number
}

const SOUND_COOLDOWN_MS = 500
const BASE_VOLUME = 0.05
const SOUND_GAIN_MULTIPLIER = 160
const MAX_OUTPUT_VOLUME = 8
const ATTACK_SECONDS = 0.008
const RELEASE_TAIL_SECONDS = 0.06

const soundTimeline: Record<NotificationSoundKind, SoundStep[]> = {
    rental_indication: [
        { frequency: 680, durationSeconds: 0.09, volume: 0.045, waveform: "sine", gapSeconds: 0.02 },
        { frequency: 920, durationSeconds: 0.13, volume: 0.05, waveform: "sine" },
    ],
    internal_chat: [
        { frequency: 780, durationSeconds: 0.08, volume: 0.04, waveform: "triangle", gapSeconds: 0.015 },
        { frequency: 640, durationSeconds: 0.08, volume: 0.038, waveform: "triangle" },
    ],
    task_notification: [
        { frequency: 560, durationSeconds: 0.9, volume: 0.05, waveform: "square", gapSeconds: 0.1 },
        { frequency: 720, durationSeconds: 0.95, volume: 0.052, waveform: "square", gapSeconds: 0.1 },
        { frequency: 560, durationSeconds: 0.9, volume: 0.05, waveform: "square", gapSeconds: 0.1 },
        { frequency: 720, durationSeconds: 0.95, volume: 0.052, waveform: "square" },
    ],
}

let audioContext: AudioContext | null = null
let unlockListenersAttached = false
let isAudioUnlocked = false
const lastPlayedByKind: Record<NotificationSoundKind, number> = {
    rental_indication: 0,
    internal_chat: 0,
    task_notification: 0,
}

function getAudioContextCtor() {
    if (typeof window === "undefined") return null
    return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null
}

function getAudioContext() {
    if (typeof window === "undefined") return null
    if (audioContext) return audioContext

    const AudioContextCtor = getAudioContextCtor()
    if (!AudioContextCtor) return null

    audioContext = new AudioContextCtor()
    return audioContext
}

async function tryUnlockAudio() {
    const context = getAudioContext()
    if (!context) return false

    if (context.state === "suspended") {
        try {
            await context.resume()
        } catch {
            return false
        }
    }

    isAudioUnlocked = context.state === "running"
    return isAudioUnlocked
}

function detachUnlockListeners() {
    if (typeof window === "undefined") return
    window.removeEventListener("pointerdown", onUserInteractionUnlock)
    window.removeEventListener("keydown", onUserInteractionUnlock)
    window.removeEventListener("touchstart", onUserInteractionUnlock)
}

async function onUserInteractionUnlock() {
    const unlocked = await tryUnlockAudio()
    if (!unlocked) return
    detachUnlockListeners()
}

function attachUnlockListeners() {
    if (typeof window === "undefined") return
    if (unlockListenersAttached) return

    unlockListenersAttached = true
    window.addEventListener("pointerdown", onUserInteractionUnlock, { passive: true })
    window.addEventListener("keydown", onUserInteractionUnlock, { passive: true })
    window.addEventListener("touchstart", onUserInteractionUnlock, { passive: true })
}

function shouldPlay(kind: NotificationSoundKind) {
    const now = Date.now()
    if (now - lastPlayedByKind[kind] < SOUND_COOLDOWN_MS) return false
    lastPlayedByKind[kind] = now
    return true
}

function playToneSequence(context: AudioContext, sequence: SoundStep[]) {
    const now = context.currentTime + 0.01
    let cursor = now
    const compressor = context.createDynamicsCompressor()

    compressor.threshold.setValueAtTime(-24, now)
    compressor.knee.setValueAtTime(18, now)
    compressor.ratio.setValueAtTime(10, now)
    compressor.attack.setValueAtTime(0.003, now)
    compressor.release.setValueAtTime(0.12, now)
    compressor.connect(context.destination)

    sequence.forEach((step) => {
        const oscillator = context.createOscillator()
        const gainNode = context.createGain()

        oscillator.type = step.waveform ?? "sine"
        oscillator.frequency.setValueAtTime(step.frequency, cursor)

        const baseStepVolume = step.volume ?? BASE_VOLUME
        const targetVolume = Math.max(
            0,
            Math.min(baseStepVolume * SOUND_GAIN_MULTIPLIER, MAX_OUTPUT_VOLUME)
        )
        gainNode.gain.setValueAtTime(0.0001, cursor)
        gainNode.gain.exponentialRampToValueAtTime(targetVolume, cursor + ATTACK_SECONDS)
        gainNode.gain.exponentialRampToValueAtTime(0.0001, cursor + step.durationSeconds)

        oscillator.connect(gainNode)
        gainNode.connect(compressor)

        oscillator.start(cursor)
        oscillator.stop(cursor + step.durationSeconds + RELEASE_TAIL_SECONDS)

        cursor += step.durationSeconds + (step.gapSeconds ?? 0)
    })

    const sequenceDuration = Math.max(0, cursor - now)
    setTimeout(() => {
        try {
            compressor.disconnect()
        } catch {
            // Ignore disconnect races after the audio graph is torn down.
        }
    }, Math.ceil((sequenceDuration + RELEASE_TAIL_SECONDS + 0.1) * 1000))
}

export function initializeNotificationSounds() {
    attachUnlockListeners()
    void tryUnlockAudio()
}

export function playNotificationSound(kind: NotificationSoundKind) {
    initializeNotificationSounds()
    if (!shouldPlay(kind)) return

    const context = getAudioContext()
    if (!context || !isAudioUnlocked || context.state !== "running") return

    const sequence = soundTimeline[kind]
    playToneSequence(context, sequence)
}
