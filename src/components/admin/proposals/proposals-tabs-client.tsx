// src/components/admin/proposals/proposals-tabs-client.tsx
"use client"
import { useState } from "react"
import { BarChart2, MessageSquare, List } from "lucide-react"

export type TabKey = "lista" | "analista" | "panorama"

type ProposalsTabsClientProps = {
  listaContent: React.ReactNode
  analistaContent: React.ReactNode
  panoramaContent: React.ReactNode
  defaultTab?: TabKey
}

const TABS = [
  { key: "lista" as TabKey, label: "Lista", Icon: List },
  { key: "analista" as TabKey, label: "Analista", Icon: MessageSquare },
  { key: "panorama" as TabKey, label: "Panorama", Icon: BarChart2 },
]

export function ProposalsTabsClient({
  listaContent,
  analistaContent,
  panoramaContent,
  defaultTab = "lista",
}: ProposalsTabsClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)

  return (
    <div>
      <div className="flex border-b border-border bg-background mb-4">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
      {activeTab === "lista" && listaContent}
      {activeTab === "analista" && analistaContent}
      {activeTab === "panorama" && panoramaContent}
    </div>
  )
}
