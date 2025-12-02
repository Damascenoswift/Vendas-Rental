"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts"

interface IndicationsChartProps {
    data: any[]
}

export function IndicationsChart({ data }: IndicationsChartProps) {
    // Calculate status counts
    const statusCounts = data.reduce((acc: any, curr: any) => {
        const status = curr.status || "EM_ANALISE"
        acc[status] = (acc[status] || 0) + 1
        return acc
    }, {})

    const chartData = [
        { name: "Em Análise", value: statusCounts["EM_ANALISE"] || 0, color: "#fbbf24" }, // Amber-400
        { name: "Aprovada", value: statusCounts["APROVADA"] || 0, color: "#34d399" },   // Emerald-400
        { name: "Rejeitada", value: statusCounts["REJEITADA"] || 0, color: "#f87171" },  // Red-400
        { name: "Concluída", value: statusCounts["CONCLUIDA"] || 0, color: "#60a5fa" },  // Blue-400
    ].filter(item => item.value > 0)

    const total = data.length

    if (total === 0) return null

    return (
        <Card className="mb-6">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Visão Geral de Status</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                itemStyle={{ fontSize: '12px', fontWeight: 500 }}
                            />
                            <Legend
                                verticalAlign="middle"
                                align="right"
                                layout="vertical"
                                iconType="circle"
                                formatter={(value, entry: any) => (
                                    <span className="text-xs text-muted-foreground ml-1">
                                        {value} ({entry.payload.value})
                                    </span>
                                )}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
