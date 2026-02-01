"use client"

import Link from "next/link"
import { useAuthSession } from "@/hooks/use-auth-session"
import { NavItem } from "./nav-item"
import {
    LayoutDashboard,
    Zap,
    Users,
    Wallet,
    FileText,
    Settings,
    LogOut,
    Building2,
    PieChart,
    CheckSquare,
    CircleDollarSign,
    Calculator,
    KanbanSquare
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function Sidebar({ className }: SidebarProps) {
    const { profile } = useAuthSession()
    const router = useRouter()
    const { showToast } = useToast()
    const [isSigningOut, setIsSigningOut] = useState(false)

    const handleSignOut = async () => {
        setIsSigningOut(true)
        const { error } = await supabase.auth.signOut()
        if (error) {
            showToast({ variant: "error", title: "Erro ao sair" })
            setIsSigningOut(false)
            return
        }
        router.replace("/login")
    }

    if (!profile) return null

    const role = profile.role

    return (
        <div className={cn("pb-12 min-h-screen w-64 border-r bg-sidebar hidden lg:block", className)}>
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    <div className="flex items-center gap-2 px-2 mb-6">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                            R
                        </div>
                        <h2 className="text-lg font-bold tracking-tight text-sidebar-foreground">
                            Rental Solar
                        </h2>
                    </div>

                    <div className="space-y-1">
                        <NavItem href="/dashboard" label="Visão Geral" icon={LayoutDashboard} />

                        {['adm_mestre', 'funcionario_n1', 'funcionario_n2', 'adm_dorata', 'supervisor'].includes(role) && (
                            <NavItem href="/admin/indicacoes" label="Indicações" icon={FileText} />
                        )}

                        {['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'vendedor_interno', 'vendedor_externo', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                            <NavItem href="/admin/tarefas" label="Tarefas" icon={CheckSquare} />
                        )}

                        {['adm_mestre', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                            <NavItem href="/admin/leads" label="Leads Rápidos" icon={FileText} />
                        )}

                        {['adm_mestre', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                            <NavItem href="/investidor" label="Portal Investidor" icon={PieChart} />
                        )}
                    </div>
                </div>

                <div className="px-3 py-2">
                    <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                        Gestão
                    </h2>
                    <div className="space-y-1">
                        {['adm_mestre', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                            <NavItem href="/admin/energia" label="Energia" icon={Zap} />
                        )}

                        {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                            <NavItem href="/admin/financeiro" label="Financeiro" icon={Wallet} />
                        )}

                        {role === 'adm_mestre' && (
                            <NavItem href="/admin/usuarios" label="Usuários" icon={Users} />
                        )}
                    </div>
                </div>

                {['adm_mestre', 'adm_dorata', 'vendedor_externo', 'vendedor_interno', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                    <div className="px-3 py-2">
                        <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                            Dorata Solar
                        </h2>
                        <div className="space-y-1">
                            {['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                <NavItem href="/admin/crm" label="CRM" icon={KanbanSquare} />
                            )}

                            {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                <>
                                    <NavItem href="/admin/estoque" label="Estoque" icon={Building2} />
                                    <NavItem href="/admin/importacao" label="Importação" icon={FileText} />
                                </>
                            )}

                            <NavItem href="/admin/orcamentos" label="Orçamentos" icon={Calculator} />

                            {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                <NavItem href="/admin/configuracoes/precos" label="Base de Cálculo" icon={CircleDollarSign} />
                            )}
                        </div>
                    </div>
                )}

                <div className="px-3 py-2">
                    <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                        Conta
                    </h2>
                    <div className="space-y-1">
                        <NavItem href="/perfil" label="Meu Perfil" icon={Settings} />
                        <button
                            onClick={handleSignOut}
                            disabled={isSigningOut}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                            <LogOut className="h-4 w-4" />
                            <span>{isSigningOut ? "Saindo..." : "Sair"}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
