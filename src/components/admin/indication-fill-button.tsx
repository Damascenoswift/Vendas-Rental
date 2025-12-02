"use client"

import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

type IndicationFillButtonProps = {
    indication: {
        tipo: "PF" | "PJ"
        nome: string
        email: string
        telefone: string
        documento: string | null
    }
    vendedorName?: string
}

export function IndicationFillButton({ indication, vendedorName }: IndicationFillButtonProps) {
    const handleFill = () => {
        // URLs dos formulários (Fluxia)
        const PF_URL = "https://app.clicksign.com/fluxia/7709258f-d77f-4cc8-bed8-17f458213bdf"
        // TODO: Adicionar URL de PJ quando o usuário fornecer
        const PJ_URL = "https://app.clicksign.com/fluxia/7709258f-d77f-4cc8-bed8-17f458213bdf" // Fallback para PF por enquanto

        const baseUrl = indication.tipo === "PF" ? PF_URL : PJ_URL

        const params = new URLSearchParams()

        // Mapeamento baseado nos IDs recuperados (data-testid)
        if (indication.tipo === "PF") {
            params.append("nome22F4C9F821Fad", indication.nome)
            params.append("cpf4Abff530D5304", indication.documento || "")

            // Ainda precisamos descobrir os IDs destes campos:
            params.append("E-mail do Signatário", indication.email) // TODO: Pegar ID
            params.append("TELEFONE", indication.telefone) // TODO: Pegar ID

            if (vendedorName) {
                params.append("Vendedor", vendedorName) // TODO: Pegar ID
            }
        } else {
            // PJ (assumindo chaves similares ou ajustando depois)
            params.append("NOME", indication.nome) // Razão Social?
            params.append("E-mail do Signatário", indication.email)
            params.append("CPF", indication.documento || "") // CNPJ?
            params.append("TELEFONE", indication.telefone)

            if (vendedorName) {
                params.append("Vendedor", vendedorName)
            }
        }

        // Limpar parâmetros vazios
        const keysToDelete: string[] = []
        params.forEach((value, key) => {
            if (!value) keysToDelete.push(key)
        })
        keysToDelete.forEach((key) => params.delete(key))

        const finalUrl = `${baseUrl}?${params.toString()}`
        window.open(finalUrl, "_blank")
    }

    return (
        <Button variant="ghost" size="icon" onClick={handleFill} title={`Preencher Formulário (${indication.tipo})`}>
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="sr-only">Preencher Formulário</span>
        </Button>
    )
}
