// src/components/admin/proposals/proposal-analyst-chat.tsx
"use client"
import { useState, useEffect, useRef, useTransition } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateNegotiationStatus } from "@/app/actions/sales-analyst"
import type { NegotiationStatus } from "@/services/sales-analyst-service"

type Message = {
  role: "analyst" | "user"
  content: string
  status_suggestion?: NegotiationStatus | null
  created_at: string
}

const STATUS_LABELS: Record<NegotiationStatus, string> = {
  sem_contato: "Sem contato",
  em_negociacao: "Em negociação",
  followup: "Followup",
  parado: "Parado",
  perdido: "Perdido",
  convertido: "Convertido",
}

const ALL_STATUSES: NegotiationStatus[] = [
  "sem_contato", "em_negociacao", "followup", "parado", "perdido", "convertido",
]

type ProposalAnalystChatProps = {
  proposalId: string
  initialMessages: Message[]
  initialStatus: NegotiationStatus
}

export function ProposalAnalystChat({
  proposalId,
  initialMessages,
  initialStatus,
}: ProposalAnalystChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [status, setStatus] = useState<NegotiationStatus>(initialStatus)
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-open: if no conversation yet, fetch first analyst message
  useEffect(() => {
    if (initialMessages.length === 0) {
      void sendMessage("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendMessage(text: string) {
    setIsLoading(true)
    try {
      const res = await fetch("/api/ai/sales-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposalId, message: text }),
      })
      const json = await res.json() as { reply?: string; status_suggestion?: NegotiationStatus; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido")

      const now = new Date().toISOString()
      const newMessages: Message[] = []
      if (text) {
        newMessages.push({ role: "user", content: text, created_at: now })
      }
      newMessages.push({
        role: "analyst",
        content: json.reply ?? "",
        status_suggestion: json.status_suggestion ?? null,
        created_at: now,
      })
      setMessages((prev) => [...prev, ...newMessages])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function handleSend() {
    if (!input.trim() || isLoading) return
    const text = input.trim()
    setInput("")
    void sendMessage(text)
  }

  function handleStatusChange(newStatus: NegotiationStatus) {
    setStatus(newStatus)
    startTransition(async () => {
      await updateNegotiationStatus(proposalId, newStatus)
    })
  }

  function handleConfirmSuggestion(suggested: NegotiationStatus) {
    handleStatusChange(suggested)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Status selector */}
      <div className="mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          Status da negociação
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={isPending}
              className={[
                "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50",
              ].join(" ")}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Chat label */}
      <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Analista</p>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "analyst" ? "space-y-1" : "flex justify-end"}>
            <div
              className={[
                "rounded-xl px-3 py-2 text-sm leading-relaxed max-w-[90%]",
                m.role === "analyst"
                  ? "bg-primary text-primary-foreground rounded-tl-sm"
                  : "bg-card border border-border text-foreground rounded-tr-sm",
              ].join(" ")}
            >
              {m.content}
            </div>
            {m.role === "analyst" && m.status_suggestion && m.status_suggestion !== status && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-xs text-primary">
                  Sugestão: mudar para <strong>{STATUS_LABELS[m.status_suggestion]}</strong>
                </span>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleConfirmSuggestion(m.status_suggestion!)}
                >
                  Confirmar
                </Button>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="bg-primary/10 rounded-xl px-3 py-2 text-sm text-primary w-fit animate-pulse">
            Analisando...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-center border border-border rounded-lg bg-background px-3 py-2">
        <input
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Responda ao analista..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="w-7 h-7 rounded-md bg-primary flex items-center justify-center disabled:opacity-40 transition-opacity"
        >
          <Send className="w-3.5 h-3.5 text-primary-foreground" />
        </button>
      </div>
    </div>
  )
}
