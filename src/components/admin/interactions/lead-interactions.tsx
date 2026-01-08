"use client"

import { useEffect, useState, useRef } from "react"
import { getInteractions, addInteraction, type Interaction } from "@/services/interactions-service"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, User as UserIcon } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { useAuthSession } from "@/hooks/use-auth-session"

interface LeadInteractionsProps {
    indicacaoId: string
}

export function LeadInteractions({ indicacaoId }: LeadInteractionsProps) {
    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [newComment, setNewComment] = useState("")
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const { showToast } = useToast()
    const { session } = useAuthSession()

    // Polling or simple fetch. For now simple fetch on mount + after send.
    // In a real app we might use Supabase Realtime subscriptions.

    const fetchInteractions = async () => {
        const data = await getInteractions(indicacaoId)
        setInteractions(data)
    }

    useEffect(() => {
        fetchInteractions()
    }, [indicacaoId])

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [interactions])

    const handleSend = async () => {
        if (!newComment.trim()) return

        setLoading(true)
        const result = await addInteraction(indicacaoId, newComment)

        if (result.error) {
            showToast({ variant: "error", title: "Erro ao enviar", description: result.error })
        } else {
            setNewComment("")
            fetchInteractions()
        }
        setLoading(false)
    }

    const currentUserEmail = session?.user.email

    return (
        <div className="flex flex-col h-[500px] border rounded-md">
            <div className="p-3 border-b bg-muted/50">
                <h3 className="text-sm font-semibold">Histórico de Atividades</h3>
            </div>

            <ScrollArea className="flex-1 p-4" viewportRef={scrollRef}>
                <div className="space-y-4">
                    {interactions.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-10">
                            Nenhuma interação registrada.
                        </p>
                    )}

                    {interactions.map((item) => {
                        const isMe = item.user.email === currentUserEmail
                        const isSystem = item.type !== 'COMMENT'

                        if (isSystem) {
                            return (
                                <div key={item.id} className="flex justify-center my-2">
                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                                        {item.content} • {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                                    </span>
                                </div>
                            )
                        }

                        return (
                            <div key={item.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-primary">
                                        {item.user.name?.charAt(0).toUpperCase() || 'U'}
                                    </span>
                                </div>
                                <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium text-foreground">
                                            {isMe ? 'Você' : item.user.name || item.user.email}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(item.created_at), { locale: ptBR })}
                                        </span>
                                    </div>
                                    <div className={`p-3 rounded-lg text-sm ${isMe
                                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                                            : 'bg-muted text-foreground rounded-tl-none'
                                        }`}>
                                        {item.content}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>

            <div className="p-3 border-t bg-background flex gap-2">
                <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Escreva um comentário..."
                    className="min-h-[40px] max-h-[100px] resize-none"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                        }
                    }}
                />
                <Button size="icon" onClick={handleSend} disabled={loading || !newComment.trim()}>
                    <Send className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
