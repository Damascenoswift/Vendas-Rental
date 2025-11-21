"use client"
import { useState } from "react"
import { useClicksign } from "@/hooks/use-clicksign"

export default function ClicksignTest() {
  const { testarConexao, loading, error } = useClicksign()
  const [resultado, setResultado] = useState<{ success: boolean; message: string } | null>(null)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">🔐 Teste Clicksign/Zapier</h1>
      <button
        className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
        onClick={async () => setResultado(await testarConexao())}
        disabled={loading}
      >
        {loading ? "Testando..." : "Testar webhook Zapier"}
      </button>
      {resultado && (
        <div className={resultado.success ? "text-emerald-600" : "text-red-600"}>{resultado.message}</div>
      )}
      {error && <div className="text-red-600">{error}</div>}
    </div>
  )
}
