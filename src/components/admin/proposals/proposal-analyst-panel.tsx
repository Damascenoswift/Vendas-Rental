"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import { MessageSquare } from "lucide-react"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import type { PriceApprovalRecord } from "@/app/actions/price-approval"
import type { NegotiationStatus } from "@/services/sales-analyst-service"
import { ProposalAnalystChat } from "./proposal-analyst-chat"
import { ProposalPriceApproval } from "./proposal-price-approval"

type AnalystMessage = {
  role: "analyst" | "user"
  content: string
  status_suggestion: NegotiationStatus | null
  created_at: string
}

type ProposalAnalystPanelProps = {
  proposalId: string
  initialMessages: AnalystMessage[]
  initialStatus: NegotiationStatus
  initialApproval: PriceApprovalRecord | null
  currentMargin: number | null
  currentValue: number | null
}

const FLOATING_PANEL_BREAKPOINT_QUERY = "(max-width: 1366px)"
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function useFloatingPanel() {
  const [isFloatingPanel, setIsFloatingPanel] = useState(false)

  useIsomorphicLayoutEffect(() => {
    const media = window.matchMedia(FLOATING_PANEL_BREAKPOINT_QUERY)
    const sync = () => setIsFloatingPanel(media.matches)
    sync()

    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  return isFloatingPanel
}

function AnalystPanelContent({
  proposalId,
  initialMessages,
  initialStatus,
  initialApproval,
  currentMargin,
  currentValue,
}: ProposalAnalystPanelProps) {
  return (
    <>
      <h2 className="text-sm font-bold text-foreground mb-3">Analista de Vendas</h2>
      <ProposalAnalystChat
        proposalId={proposalId}
        initialMessages={initialMessages}
        initialStatus={initialStatus}
      />
      <ProposalPriceApproval
        proposalId={proposalId}
        initialApproval={initialApproval}
        currentMargin={currentMargin}
        currentValue={currentValue}
      />
    </>
  )
}

export function ProposalAnalystPanel(props: ProposalAnalystPanelProps) {
  const isFloatingPanel = useFloatingPanel()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isFloatingPanel && open) {
      setOpen(false)
    }
  }, [isFloatingPanel, open])

  if (!isFloatingPanel) {
    return (
      <div className="w-80 flex-shrink-0 border-l border-border bg-card px-4 py-4 overflow-hidden flex flex-col">
        <AnalystPanelContent {...props} />
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="icon"
          className="fixed bottom-40 right-5 z-40 h-12 w-12 rounded-full shadow-lg"
          aria-label="Abrir analista de vendas"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" forceMount className="w-[min(92vw,28rem)] p-4 overflow-hidden">
        <SheetTitle className="sr-only">Analista de Vendas</SheetTitle>
        <div className="h-full overflow-hidden flex flex-col">
          <AnalystPanelContent {...props} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
