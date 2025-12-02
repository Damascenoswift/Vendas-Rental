"use client"

import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

type IndicationFillButtonProps = {
    indication: {
        tipo: "PF" | "PJ"
        nome: string
        email: string
        telefone: string
        documento: string | null
    }
}

export function IndicationFillButton({ indication }: IndicationFillButtonProps) {
    const handleFill = () => {
        // URLs dos formulários (Fluxia)
        const PF_URL = "https://app.clicksign.com/fluxia/7709258f-d77f-4cc8-bed8-17f458213bdf"
        // TODO: Adicionar URL de PJ quando o usuário fornecer
        const PJ_URL = "https://app.clicksign.com/fluxia/7709258f-d77f-4cc8-bed8-17f458213bdf" // Fallback para PF por enquanto

        const baseUrl = indication.tipo === "PF" ? PF_URL : PJ_URL

        // Mapeamento de campos
        // Tenta adivinhar os nomes dos campos no Fluxia. 
        // O usuário pode precisar ajustar isso se os nomes no formulário forem diferentes.
        const params = new URLSearchParams()

        if (indication.tipo === "PF") {
            params.append("nome_completo", indication.nome) // Tentativa comum: nome, nome_completo, name
            params.append("email", indication.email)
            params.append("cpf", indication.documento || "")
            params.append("telefone", indication.telefone)
        } else {
            params.append("razao_social", indication.nome)
            params.append("email", indication.email)
            params.append("cnpj", indication.documento || "")
            params.append("telefone", indication.telefone)
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
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleFill}>
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="sr-only">Preencher Formulário</span>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Preencher Formulário ({indication.tipo})</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
