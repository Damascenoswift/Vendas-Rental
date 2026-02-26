"use client"

import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import { buildUserProfile, getProfile, type UserProfile } from "@/lib/auth"

type AuthStatus = "loading" | "authenticated" | "unauthenticated"

type UseAuthSessionReturn = {
  session: Session | null
  status: AuthStatus
  profile: UserProfile | null
}

export function useAuthSession(): UseAuthSessionReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    let isMounted = true
    let loadingGuardTimer: number | null = null

    const resolveProfile = async (user: Session["user"]) => {
      try {
        const dbProfile = await getProfile(supabase, user.id)
        if (!isMounted) return
        setProfile(dbProfile || buildUserProfile(user))
      } catch (error) {
        console.error("Erro ao carregar perfil da sessão:", error)
        if (!isMounted) return
        setProfile(buildUserProfile(user))
      }
    }

    const resolveSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()

        if (!isMounted) return

        const currentSession = data.session ?? null
        setSession(currentSession)
        setStatus(currentSession ? "authenticated" : "unauthenticated")

        if (currentSession?.user) {
          void resolveProfile(currentSession.user)
        } else {
          setProfile(null)
        }
      } catch (error) {
        console.error("Erro ao resolver sessão atual:", error)
        if (!isMounted) return
        setSession(null)
        setProfile(null)
        setStatus("unauthenticated")
      } finally {
        if (loadingGuardTimer !== null) {
          window.clearTimeout(loadingGuardTimer)
          loadingGuardTimer = null
        }
      }
    }

    loadingGuardTimer = window.setTimeout(() => {
      if (!isMounted) return
      setStatus((current) => (current === "loading" ? "unauthenticated" : current))
    }, 8000)

    void resolveSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return

      setSession(newSession)
      setStatus(newSession ? "authenticated" : "unauthenticated")

      if (newSession?.user) {
        void resolveProfile(newSession.user)
      } else {
        setProfile(null)
      }
    })

    return () => {
      isMounted = false
      if (loadingGuardTimer !== null) {
        window.clearTimeout(loadingGuardTimer)
      }
      subscription.unsubscribe()
    }
  }, [])

  return {
    session,
    status,
    profile,
  }
}
