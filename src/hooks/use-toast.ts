"use client"

import { create } from "zustand"

export type ToastVariant = "success" | "error" | "info"

export type ToastMessage = {
  id: number
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

type ToastState = {
  toasts: ToastMessage[]
  showToast: (toast: Omit<ToastMessage, "id">) => void
  dismissToast: (id: number) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  showToast: (toast) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    const duration = toast.duration ?? 4000

    set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }))

    if (duration > 0) {
      setTimeout(() => {
        const stillExists = get().toasts.some((item) => item.id === id)
        if (stillExists) {
          get().dismissToast(id)
        }
      }, duration)
    }
  },
  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
}))

export function useToast() {
  const showToast = useToastStore((state) => state.showToast)
  return { showToast }
}
