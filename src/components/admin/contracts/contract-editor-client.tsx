"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { saveContractDraft, approveContract } from '@/app/actions/contracts-editor'
import { ArrowLeft, Save, CheckCircle, FileDown } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from "@/hooks/use-toast"

interface EditorClientProps {
    contractId: string
    initialContent: string
    isApproved: boolean
    docxUrl?: string
}

export function ContractEditorClient({ contractId, initialContent, isApproved, docxUrl }: EditorClientProps) {
    const [isSaving, setIsSaving] = useState(false)
    const { showToast } = useToast()
    const router = useRouter()

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
        ],
        content: initialContent,
        editable: !isApproved,
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[500px] p-8 bg-white border shadow-sm rounded-md',
            },
        },
    })

    if (!editor) {
        return null
    }

    const handleSave = async () => {
        setIsSaving(true)
        const html = editor.getHTML()
        try {
            const result = await saveContractDraft(contractId, html)
            if (result.success) {
                showToast({ title: "Salvo", description: "Rascunho atualizado.", variant: "success" })
            } else {
                showToast({ title: "Erro", description: result.message, variant: "error" })
            }
        } catch (e) {
            showToast({ title: "Erro", description: "Falha ao salvar.", variant: "error" })
        } finally {
            setIsSaving(false)
        }
    }

    const handleApprove = async () => {
        if (!confirm("Tem certeza que deseja aprovar? O contrato não poderá mais ser editado.")) return

        setIsSaving(true)
        const html = editor.getHTML()
        try {
            const result = await approveContract(contractId, html)
            if (result.success) {
                showToast({ title: "Aprovado!", description: "Contrato gerado e finalizado.", variant: "success" })
                router.refresh()
            } else {
                showToast({ title: "Erro", description: result.message, variant: "error" })
            }
        } catch (e) {
            showToast({ title: "Erro", description: "Falha ao aprovar.", variant: "error" })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="container mx-auto py-8">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-background z-10 p-4 border-b">
                <div className="flex items-center gap-4">
                    <Link href="/admin/contratos">
                        <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold">Editor de Contrato</h1>
                        <p className="text-xs text-muted-foreground">{isApproved ? "Visualização (Aprovado)" : "Modo Edição (Rascunho)"}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isApproved && (
                        <>
                            <Button variant="outline" onClick={handleSave} disabled={isSaving}>
                                <Save className="h-4 w-4 mr-2" />
                                {isSaving ? "Salvando..." : "Salvar Rascunho"}
                            </Button>
                            <Button onClick={handleApprove} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Aprovar e Finalizar
                            </Button>
                        </>
                    )}
                    {isApproved && docxUrl && (
                        <a href={docxUrl} target="_blank" download>
                            <Button>
                                <FileDown className="h-4 w-4 mr-2" />
                                Baixar DOCX
                            </Button>
                        </a>
                    )}
                </div>
            </div>

            {/* Editor Area */}
            <div className="max-w-4xl mx-auto">
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}
