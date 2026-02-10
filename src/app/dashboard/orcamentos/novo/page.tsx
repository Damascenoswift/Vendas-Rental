"use client"

import { useEffect } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OrcamentoForm } from "@/components/forms/orcamento-form"
import { useAuthSession } from "@/hooks/use-auth-session"
import { useRouter } from "next/navigation"

export default function NovoOrcamentoPage() {
    const { session, status, profile } = useAuthSession()
    const router = useRouter()
    const userId = session?.user.id
    const internalRoles = ['adm_mestre', 'adm_dorata', 'supervisor', 'suporte_tecnico', 'suporte_limitado', 'funcionario_n1', 'funcionario_n2']
    const shouldUseProposalFlow = internalRoles.includes(profile?.role ?? '')

    useEffect(() => {
        if (status === "authenticated" && shouldUseProposalFlow) {
            router.replace("/admin/orcamentos/novo")
        }
    }, [status, shouldUseProposalFlow, router])

    if (!userId) {
        return (
            <div className="flex justify-center p-8">
                <span className="text-muted-foreground">Carregando...</span>
            </div>
        )
    }

    if (shouldUseProposalFlow) {
        return (
            <div className="flex justify-center p-8">
                <span className="text-muted-foreground">Redirecionando para o novo fluxo de orçamento...</span>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-2">
                <Link href="/dashboard">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Voltar</span>
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Novo Orçamento</h1>
                    <p className="text-muted-foreground">Preencha os dados abaixo para solicitar um orçamento.</p>
                </div>
            </div>

            <OrcamentoForm userId={userId} />
        </div>
    )
}
