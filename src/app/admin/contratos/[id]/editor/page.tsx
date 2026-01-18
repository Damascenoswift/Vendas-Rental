import { createClient } from "@/lib/supabase/server"
import { ContractEditorClient } from "@/components/admin/contracts/contract-editor-client"
import { notFound } from "next/navigation"

export default async function ContractEditorServerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()

    const { data: contract, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !contract) {
        return notFound()
    }

    return (
        <ContractEditorClient
            contractId={contract.id}
            initialContent={contract.html_content || "<p>Erro: Conteúdo vazio.</p>"}
            isApproved={contract.status === 'APPROVED'}
            docxUrl={contract.docx_url} // We might need to sign this URL if it's private.
        />
    )
}
