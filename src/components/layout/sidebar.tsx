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
    const [isCollapsed, setIsCollapsed] = useState(false)

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
                "relative hidden h-screen shrink-0 overflow-x-hidden overflow-y-auto border-r border-sidebar-border/70 bg-sidebar/95 pb-12 shadow-[8px_0_32px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl transition-[width] duration-300 lg:block",
                isCollapsed ? "w-20" : "w-64",
                className
            )}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.14),transparent_44%),radial-gradient(circle_at_100%_14%,rgba(14,165,233,0.1),transparent_40%)]" />
            <div className="relative space-y-4 py-4">
                <div className="px-3 py-2">
                    <div className={cn("mb-3 flex", isCollapsed ? "justify-center" : "justify-between")}>
                        {!isCollapsed && (
                            <span className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/80">
                                Portal Rental
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsCollapsed((value) => !value)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-background/70 text-sidebar-foreground/85 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            aria-label={isCollapsed ? "Expandir menu lateral" : "Minimizar menu lateral"}
                            title={isCollapsed ? "Expandir menu lateral" : "Minimizar menu lateral"}
                        >
                            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                    </div>
                    <div className={cn("mb-6 flex items-center gap-2", isCollapsed ? "justify-center px-0" : "rounded-2xl border border-border/70 bg-background/70 p-2.5")}>
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-primary/90 font-bold text-primary-foreground shadow-md">
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
                        {!isCollapsed ? (
                            <div className="space-y-0.5">
                                <h2 className="text-sm font-semibold leading-none tracking-wide text-sidebar-foreground">
                                    Rental Energia
                                </h2>
                                <p className="text-[11px] text-sidebar-foreground/70">
                                    Gestão operacional
                                </p>
                            </div>
                        ) : null}
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
                        <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
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
                            <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
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
                            <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
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
                        <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
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
                                "group flex w-full items-center rounded-xl border border-transparent text-sm font-medium text-rose-700/90 transition-all hover:border-rose-400/45 hover:bg-rose-500/10 hover:text-rose-800",
                                isCollapsed ? "h-10 justify-center px-0 py-0" : "gap-3 px-3 py-2"
                            )}
                        >
                            <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                            {!isCollapsed && <span>{isSigningOut ? "Saindo..." : "Sair"}</span>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
