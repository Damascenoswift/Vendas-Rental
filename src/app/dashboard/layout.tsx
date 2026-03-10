"use client"

import { useEffect } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"

import { ToastContainer } from "@/components/ui/toaster"
import { useAuthSession } from "@/hooks/use-auth-session"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { NotificationSoundListener } from "@/components/layout/notification-sound-listener"

type DashboardLayoutProps = {
  children: ReactNode
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const router = useRouter()
  const { status } = useAuthSession()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login")
    }
  }, [status, router])

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="app-shell-gradient flex min-h-screen items-center justify-center">
        <span className="glass-surface rounded-full border px-4 py-2 text-sm text-muted-foreground">
          Verificando acesso…
        </span>
      </div>
    )
  }

  return (
    <div className="app-shell-gradient relative flex h-screen w-full overflow-hidden">
      <NotificationSoundListener />
      <Sidebar className="hidden lg:block border-r-0 bg-transparent" />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto px-3 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-4 lg:px-8 lg:pb-8">
          <div className="mx-auto w-full max-w-[1600px] animate-rise-in">
            {children}
          </div>
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
