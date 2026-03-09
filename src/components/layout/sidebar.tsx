"use client"

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
    KanbanSquare,
    MessageCircle,
    Bell,
    MessageSquareText,
    Hammer,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { hasWorksOnlyScope } from "@/lib/department-access"

type SidebarProps = React.HTMLAttributes<HTMLDivElement>

export function Sidebar({ className }: SidebarProps) {
    const { profile } = useAuthSession()
    const router = useRouter()
    const { showToast } = useToast()
    const [isSigningOut, setIsSigningOut] = useState(false)
    const [logoLoadError, setLogoLoadError] = useState(false)
    const [unreadChatCount, setUnreadChatCount] = useState(0)
    const [isCollapsed, setIsCollapsed] = useState(true)

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

    const role = profile?.role ?? ""
    const department = profile?.department ?? null
    const worksOnlyScope = hasWorksOnlyScope(department)
    const canAccessInternalChat = Boolean(profile?.internalChatAccess)
    const canAccessIndicacoes =
        Boolean(role) && (
            ['adm_mestre', 'funcionario_n1', 'funcionario_n2', 'adm_dorata', 'supervisor'].includes(role) ||
            department === 'financeiro'
        )

    useEffect(() => {
        if (!profile?.id || !canAccessInternalChat) {
            setUnreadChatCount(0)
            return
        }

        let isMounted = true

        const loadUnreadChatCount = async () => {
            const { data, error } = await supabase
                .from("internal_chat_participants")
                .select("unread_count")
                .eq("user_id", profile.id)

            if (error) {
                console.error("Erro ao carregar badge de chat interno:", error)
                return
            }

            const total = ((data ?? []) as { unread_count: number | null }[]).reduce((sum, row) => {
                const unread = typeof row.unread_count === "number" ? row.unread_count : 0
                return sum + Math.max(unread, 0)
            }, 0)

            if (isMounted) {
                setUnreadChatCount(total)
            }
        }

        void loadUnreadChatCount()

        const channel = supabase
            .channel(`sidebar-internal-chat-${profile.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "internal_chat_participants",
                    filter: `user_id=eq.${profile.id}`,
                },
                () => {
                    void loadUnreadChatCount()
                }
            )
            .subscribe()

        return () => {
            isMounted = false
            void supabase.removeChannel(channel)
        }
    }, [canAccessInternalChat, profile?.id])

    if (!profile || !role) return null

    return (
        <div
            className={cn(
                "h-screen shrink-0 overflow-x-hidden overflow-y-auto border-r bg-sidebar pb-12 hidden lg:block transition-all duration-200",
                isCollapsed ? "w-20" : "w-64",
                className
            )}
        >
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    <div className={cn("mb-3 flex", isCollapsed ? "justify-center" : "justify-end")}>
                        <button
                            type="button"
                            onClick={() => setIsCollapsed((value) => !value)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            aria-label={isCollapsed ? "Expandir menu lateral" : "Minimizar menu lateral"}
                            title={isCollapsed ? "Expandir menu lateral" : "Minimizar menu lateral"}
                        >
                            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                    </div>
                    <div className={cn("flex items-center gap-2 mb-6", isCollapsed ? "justify-center px-0" : "px-2")}>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold overflow-hidden">
                            {!logoLoadError ? (
                                <Image
                                    src="/rental-logo.png"
                                    alt="Logo Rental Energia"
                                    width={32}
                                    height={32}
                                    className="h-full w-full object-contain"
                                    onError={() => setLogoLoadError(true)}
                                    priority
                                />
                            ) : (
                                "R"
                            )}
                        </div>
                        {!isCollapsed && (
                            <h2 className="text-lg font-bold tracking-tight text-sidebar-foreground">
                                Rental Energia
                            </h2>
                        )}
                    </div>

                    <div className="space-y-1">
                        {worksOnlyScope ? (
                            <>
                                <NavItem collapsed={isCollapsed} href="/admin/obras" label="Obras" icon={Hammer} />
                                <NavItem collapsed={isCollapsed} href="/admin/notificacoes" label="Notificações" icon={Bell} />
                                {canAccessInternalChat && (
                                    <NavItem collapsed={isCollapsed}
                                        href="/admin/chat"
                                        label="Chat Interno"
                                        icon={MessageSquareText}
                                        badgeCount={unreadChatCount}
                                    />
                                )}
                            </>
                        ) : (
                            <>
                                <NavItem collapsed={isCollapsed} href="/dashboard" label="Visão Geral" icon={LayoutDashboard} />

                                {canAccessIndicacoes && (
                                    <NavItem collapsed={isCollapsed} href="/admin/indicacoes" label="Indicações" icon={FileText} />
                                )}

                                {['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'vendedor_interno', 'vendedor_externo', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                    <NavItem collapsed={isCollapsed} href="/admin/tarefas" label="Tarefas" icon={CheckSquare} />
                                )}

                                {canAccessInternalChat && (
                                    <NavItem collapsed={isCollapsed}
                                        href="/admin/chat"
                                        label="Chat Interno"
                                        icon={MessageSquareText}
                                        badgeCount={unreadChatCount}
                                    />
                                )}

                                <NavItem collapsed={isCollapsed} href="/admin/notificacoes" label="Notificações" icon={Bell} />

                                {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                    <NavItem collapsed={isCollapsed} href="/admin/leads" label="Leads Rápidos" icon={FileText} />
                                )}

                                {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                    <NavItem collapsed={isCollapsed} href="/investidor" label="Portal Investidor" icon={PieChart} />
                                )}
                            </>
                        )}
                    </div>
                </div>

                {!worksOnlyScope && (
                    <div className="px-3 py-2">
                    {!isCollapsed && (
                        <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                            Gestão
                        </h2>
                    )}
                    <div className="space-y-1">
                        {['adm_mestre', 'adm_dorata', 'supervisor', 'suporte', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                            <NavItem collapsed={isCollapsed} href="/admin/obras" label="Obras" icon={Hammer} />
                        )}

                        {['adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                            <NavItem collapsed={isCollapsed} href="/admin/energia" label="Energia" icon={Zap} />
                        )}

                        {(['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) || department === 'financeiro') && (
                            <NavItem collapsed={isCollapsed} href="/admin/financeiro" label="Financeiro" icon={Wallet} />
                        )}

                        {['supervisor', 'vendedor_interno'].includes(role) && (
                            <NavItem collapsed={isCollapsed} href="/financeiro" label="Meu Financeiro" icon={Wallet} />
                        )}

                        {(role === 'adm_mestre' || role === 'adm_dorata') && (
                            <NavItem collapsed={isCollapsed} href="/admin/usuarios" label="Usuários" icon={Users} />
                        )}

                        {['adm_mestre', 'adm_dorata', 'suporte_tecnico', 'suporte_limitado'].includes(role) && (
                            <NavItem collapsed={isCollapsed} href="/admin/whatsapp" label="WhatsApp" icon={MessageCircle} />
                        )}
                    </div>
                </div>
                )}

                {!worksOnlyScope && ['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                    <div className="px-3 py-2">
                        {!isCollapsed && (
                            <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                                Rental
                            </h2>
                        )}
                        <div className="space-y-1">
                            <NavItem collapsed={isCollapsed} href="/admin/crm/rental" label="CRM Rental" icon={KanbanSquare} />
                            <NavItem collapsed={isCollapsed} href="/admin/energia" label="Energia" icon={Zap} />
                            <NavItem collapsed={isCollapsed} href="/admin/energia/usinas" label="Usinas" icon={Building2} />
                            <NavItem collapsed={isCollapsed} href="/admin/energia/ucs" label="UCs" icon={FileText} />
                            <NavItem collapsed={isCollapsed} href="/admin/energia/alocacoes" label="Alocações" icon={CheckSquare} />
                            <NavItem collapsed={isCollapsed} href="/admin/energia/faturas" label="Faturas" icon={Wallet} />
                            <NavItem collapsed={isCollapsed} href="/admin/energia/producao" label="Produção" icon={PieChart} />
                        </div>
                    </div>
                )}

                {!worksOnlyScope && ['adm_mestre', 'adm_dorata', 'vendedor_externo', 'vendedor_interno', 'supervisor', 'suporte', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                    <div className="px-3 py-2">
                        {!isCollapsed && (
                            <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                                Dorata Solar
                            </h2>
                        )}
                        <div className="space-y-1">
                            {['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                <NavItem collapsed={isCollapsed} href="/admin/crm" label="CRM" icon={KanbanSquare} exactMatch />
                            )}

                            {['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                <NavItem collapsed={isCollapsed} href="/admin/contatos" label="Contatos" icon={Users} />
                            )}

                            {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                <>
                                    <NavItem collapsed={isCollapsed} href="/admin/estoque" label="Estoque" icon={Building2} />
                                    <NavItem collapsed={isCollapsed} href="/admin/importacao" label="Importação" icon={FileText} />
                                </>
                            )}

                            <NavItem collapsed={isCollapsed} href="/admin/orcamentos" label="Orçamentos" icon={Calculator} />

                            {['adm_mestre', 'adm_dorata', 'funcionario_n1', 'funcionario_n2'].includes(role) && (
                                <NavItem collapsed={isCollapsed} href="/admin/configuracoes/precos" label="Base de Cálculo" icon={CircleDollarSign} />
                            )}
                        </div>
                    </div>
                )}

                <div className="px-3 py-2">
                    {!isCollapsed && (
                        <h2 className="mb-2 px-4 text-xs font-semibold tracking-tight text-muted-foreground uppercase">
                            Conta
                        </h2>
                    )}
                    <div className="space-y-1">
                        <NavItem collapsed={isCollapsed} href="/perfil" label="Meu Perfil" icon={Settings} />
                        <button
                            onClick={handleSignOut}
                            disabled={isSigningOut}
                            title="Sair"
                            aria-label="Sair"
                            className={cn(
                                "flex w-full items-center rounded-md text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors",
                                isCollapsed ? "h-10 justify-center px-0 py-0" : "gap-3 px-3 py-2"
                            )}
                        >
                            <LogOut className="h-4 w-4" />
                            {!isCollapsed && <span>{isSigningOut ? "Saindo..." : "Sair"}</span>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
