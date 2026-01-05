"use client"

import { useEffect } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"

import { ToastContainer } from "@/components/ui/toaster"
import { useAuthSession } from "@/hooks/use-auth-session"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

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
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Verificando acesso…</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      <Sidebar className="hidden lg:block border-r bg-background" />
      <div className="flex flex-col flex-1 h-screen overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
