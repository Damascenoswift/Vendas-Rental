"use client"

import { useState } from "react"
import { PricingRule, updatePricingRule } from "@/services/proposal-service"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Save } from "lucide-react"

interface PricingRulesTableProps {
    rules: PricingRule[]
}

export function PricingRulesTable({ rules }: PricingRulesTableProps) {
    const [editingValues, setEditingValues] = useState<Record<string, number>>({})
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
    const { showToast } = useToast()

    const handleValueChange = (id: string, val: string) => {
        setEditingValues(prev => ({ ...prev, [id]: parseFloat(val) }))
    }

    const handleSave = async (rule: PricingRule) => {
        const newValue = editingValues[rule.id]
        if (newValue === undefined || isNaN(newValue)) return

        try {
            setLoadingMap(prev => ({ ...prev, [rule.id]: true }))
            await updatePricingRule(rule.id, { value: newValue })
            showToast({
                title: "Atualizado",
                description: `Regra "${rule.name}" atualizada para ${newValue}`,
                variant: "success"
            })
            // Clear edit state to show saved value
            setEditingValues(prev => {
                const newState = { ...prev }
                delete newState[rule.id]
                return newState
            })
        } catch (error) {
            showToast({
                title: "Erro",
                description: "Falha ao atualizar regra.",
                variant: "error"
            })
        } finally {
            setLoadingMap(prev => ({ ...prev, [rule.id]: false }))
        }
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Valor Atual</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rules.map((rule) => {
                        const isEditing = editingValues[rule.id] !== undefined
                        const currentValue = isEditing ? editingValues[rule.id] : rule.value

                        return (
                            <TableRow key={rule.id}>
                                <TableCell className="font-medium">{rule.name}</TableCell>
                                <TableCell>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        className="w-32"
                                        value={currentValue}
                                        onChange={(e) => handleValueChange(rule.id, e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>{rule.unit}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                    {rule.description}
                                </TableCell>
                                <TableCell>
                                    {isEditing && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleSave(rule)}
                                            disabled={loadingMap[rule.id]}
                                        >
                                            {loadingMap[rule.id] ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Save className="h-4 w-4 text-green-600" />
                                            )}
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}
