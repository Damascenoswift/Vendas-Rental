"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { ToastContainer } from "@/components/ui/toaster"
import { useAuthSession } from "@/hooks/use-auth-session"
import type { Brand, UserRole } from "@/lib/auth"

const roleLabels: Record<UserRole, string> = {
  vendedor_externo: "Vendedor externo",
  vendedor_interno: "Vendedor interno",
  supervisor: "Supervisor",
  adm_mestre: "Administrador mestre",
  adm_dorata: "Administrador Dorata",
}

const brandLabels: Record<Brand, string> = {
  rental: "Rental",
  dorata: "Dorata",
}
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

type DashboardLayoutProps = {
  children: ReactNode
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const router = useRouter()
  const { session, status, profile } = useAuthSession()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login")
    }
  }, [status, router])

  const displayName = useMemo(() => {
    const metadataName = session?.user.user_metadata?.nome as string | undefined
    if (metadataName && metadataName.trim().length > 0) {
      return metadataName
    }

    const email = session?.user.email ?? ""
    return email.split("@")[0] || "Usuário"
  }, [session])

  const userRoleLabel = profile ? roleLabels[profile.role] : "Função não informada"

  const brandsLabel = useMemo(() => {
    if (!profile) return "—"
    return profile.allowedBrands.map((brand) => brandLabels[brand]).join(" • ")
  }, [profile])

  const handleSignOut = async () => {
    setSignOutError(null)
    setIsSigningOut(true)

    const { error } = await supabase.auth.signOut()

    if (error) {
      setSignOutError("Não foi possível encerrar a sessão. Tente novamente.")
      setIsSigningOut(false)
      showToast({
        variant: "error",
        title: "Erro ao sair",
        description: "Tente novamente em instantes.",
      })
      return
    }

    setIsSigningOut(false)
    router.replace("/login")
    router.refresh()
    showToast({
      variant: "success",
      title: "Sessão encerrada",
      description: "Você saiu do painel com segurança.",
    })
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Verificando acesso…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Painel Comercial
            </p>
            <p className="text-sm text-muted-foreground">
              Conectado como <span className="font-semibold text-foreground">{displayName}</span>
            </p>
            {profile?.companyName ? (
              <p className="text-xs text-muted-foreground">
                Empresa: <span className="font-medium text-foreground">{profile.companyName}</span>
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden flex-col text-right text-xs text-muted-foreground sm:flex">
              <span>{session?.user.email ?? "—"}</span>
              <span className="font-medium text-foreground">{userRoleLabel}</span>
              <span className="text-muted-foreground/80">Marcas: {brandsLabel}</span>
            </div>

            {profile && profile.role === 'adm_mestre' && (
              <Button variant="default" size="sm" asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                <Link href="/admin/leads">Leads Rápidos</Link>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? "Saindo…" : "Sair do Sistema"}
            </Button>
          </div>
        </div>
      </header>

      {signOutError ? (
        <div className="bg-destructive/10 text-destructive border-destructive/30 border-b px-4 py-3 text-sm">
          {signOutError}
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl px-4 py-10">{children}</main>
      <ToastContainer />
    </div>
  )
}
