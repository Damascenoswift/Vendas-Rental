export type RoundMode = "CEIL" | "FLOOR" | "ROUND"
export type GraceInterestMode = "COMPOUND" | "SIMPLE"

export type ProposalCalcParams = {
    default_oversizing_factor: number
    micro_per_modules_divisor: number
    micro_unit_power_kw: number
    micro_rounding_mode: RoundMode
    grace_interest_mode: GraceInterestMode
    duplication_rule: "DUPLICATE_KIT_AND_SOLO_STRUCTURE" | "NO_DUPLICATION"
}

export type ProposalStringInverterInput = {
    product_id: string
    quantity: number
    unit_cost: number
    power_kw: number
    power_source: "product" | "manual"
    purchase_required: boolean
}

export type ProposalTradeMode = "TOTAL_VALUE" | "INSTALLMENTS"

export type ProposalCalcInput = {
    dimensioning: {
        qtd_modulos: number
        potencia_modulo_w: number
        indice_producao: number
        tipo_inversor: "STRING" | "MICRO"
        fator_oversizing: number
        potencia_inversor_string_kw?: number
        qtd_inversor_string?: number
        qtd_inversor_micro?: number
        string_inverters?: ProposalStringInverterInput[]
    }
    kit: {
        module_cost_per_watt: number
        cabling_unit_cost: number
        micro_unit_cost: number
        string_inverter_total_cost: number
    }
    structure: {
        qtd_placas_solo: number
        qtd_placas_telhado: number
        valor_unit_solo: number
        valor_unit_telhado: number
    }
    margin: {
        margem_percentual: number
    }
    extras: {
        valor_baterias: number
        valor_adequacao_padrao: number
        outros_extras: { id: string; name: string; value: number }[]
    }
    finance: {
        enabled: boolean
        entrada_valor: number
        carencia_meses: number
        juros_mensal: number
        num_parcelas: number
        baloes: { balao_valor: number; balao_mes: number }[]
    }
    trade?: {
        enabled: boolean
        mode: ProposalTradeMode
        value: number
    }
    params?: Partial<ProposalCalcParams>
}

export type ProposalCalcOutput = {
    dimensioning: {
        kWp: number
        kWh_estimado: number
        inversor: {
            tipo: "STRING" | "MICRO"
            pot_string_kw: number
            qtd_string: number
            qtd_micro: number
            qtd_micro_sugerida: number
            pot_micro_total_kw: number
        }
    }
    kit: {
        custo_modulo_unitario: number
        custo_modulos_total: number
        custo_inversor_total: number
        custo_kit: number
    }
    structure: {
        valor_estrutura_solo: number
        valor_estrutura_telhado: number
        valor_estrutura_total: number
    }
    margin: {
        margem_valor: number
    }
    extras: {
        extras_total: number
    }
    totals: {
        soma_com_estrutura: number
        total_a_vista: number
        views: {
            view_valor_kit: number
            view_material: number
        }
    }
    finance: {
        entrada_percentual: number
        valor_financiado: number
        saldo_pos_carencia: number
        parcela_mensal: number
        total_pago: number
        juros_pagos: number
    }
    trade: {
        enabled: boolean
        mode: ProposalTradeMode
        value: number
        applied_total_value: number
        applied_installments_value: number
    }
}

export type ProposalCalculation = {
    params: ProposalCalcParams
    input: ProposalCalcInput
    output: ProposalCalcOutput
    commission?: {
        percent: number
        value: number
        base_value: number
    }
}

const DEFAULT_PARAMS: ProposalCalcParams = {
    default_oversizing_factor: 1.25,
    micro_per_modules_divisor: 4,
    micro_unit_power_kw: 2,
    micro_rounding_mode: "CEIL",
    grace_interest_mode: "COMPOUND",
    duplication_rule: "DUPLICATE_KIT_AND_SOLO_STRUCTURE"
}

function roundMode(value: number, mode: RoundMode) {
    if (!Number.isFinite(value)) return 0
    if (mode === "CEIL") return Math.ceil(value)
    if (mode === "FLOOR") return Math.floor(value)
    return Math.round(value)
}

function pmt(rate: number, nper: number, pv: number) {
    if (!Number.isFinite(rate) || !Number.isFinite(nper) || !Number.isFinite(pv)) return 0
    if (nper <= 0) return 0
    if (rate === 0) return pv / nper
    return (rate * pv) / (1 - Math.pow(1 + rate, -nper))
}

export function calculateFinancedBalanceAfterGrace(params: {
    financed_value: number
    monthly_rate: number
    grace_months: number
    grace_interest_mode: GraceInterestMode
}) {
    const financedValue = Number(params.financed_value || 0)
    const monthlyRate = Number(params.monthly_rate || 0)
    const graceMonths = Number(params.grace_months || 0)

    if (!Number.isFinite(financedValue) || financedValue <= 0) return 0
    if (!Number.isFinite(monthlyRate) || monthlyRate < 0) return financedValue
    if (!Number.isFinite(graceMonths) || graceMonths <= 0) return financedValue

    return params.grace_interest_mode === "COMPOUND"
        ? financedValue * Math.pow(1 + monthlyRate, graceMonths)
        : financedValue * (1 + monthlyRate * graceMonths)
}

export function calculateInstallmentFromRate(params: {
    financed_value: number
    monthly_rate: number
    grace_months: number
    grace_interest_mode: GraceInterestMode
    installments: number
}) {
    const installments = Number(params.installments || 0)
    if (!Number.isFinite(installments) || installments <= 0) return 0

    const balanceAfterGrace = calculateFinancedBalanceAfterGrace({
        financed_value: params.financed_value,
        monthly_rate: params.monthly_rate,
        grace_months: params.grace_months,
        grace_interest_mode: params.grace_interest_mode,
    })

    return pmt(Number(params.monthly_rate || 0), installments, balanceAfterGrace)
}

export function solveMonthlyRateFromInstallment(params: {
    desired_installment: number
    financed_value: number
    grace_months: number
    grace_interest_mode: GraceInterestMode
    installments: number
}) {
    const desiredInstallment = Number(params.desired_installment || 0)
    const financedValue = Number(params.financed_value || 0)
    const installments = Number(params.installments || 0)

    if (!Number.isFinite(desiredInstallment) || desiredInstallment <= 0) return 0
    if (!Number.isFinite(financedValue) || financedValue <= 0) return 0
    if (!Number.isFinite(installments) || installments <= 0) return 0

    const installmentAtZeroRate = calculateInstallmentFromRate({
        financed_value: financedValue,
        monthly_rate: 0,
        grace_months: params.grace_months,
        grace_interest_mode: params.grace_interest_mode,
        installments,
    })

    if (desiredInstallment <= installmentAtZeroRate) return 0

    let lowRate = 0
    let highRate = 0.05
    let installmentAtHighRate = calculateInstallmentFromRate({
        financed_value: financedValue,
        monthly_rate: highRate,
        grace_months: params.grace_months,
        grace_interest_mode: params.grace_interest_mode,
        installments,
    })

    const maxRate = 3
    while (installmentAtHighRate < desiredInstallment && highRate < maxRate) {
        highRate *= 2
        installmentAtHighRate = calculateInstallmentFromRate({
            financed_value: financedValue,
            monthly_rate: highRate,
            grace_months: params.grace_months,
            grace_interest_mode: params.grace_interest_mode,
            installments,
        })
    }

    if (installmentAtHighRate < desiredInstallment) {
        return highRate
    }

    for (let i = 0; i < 80; i += 1) {
        const midRate = (lowRate + highRate) / 2
        const installmentAtMidRate = calculateInstallmentFromRate({
            financed_value: financedValue,
            monthly_rate: midRate,
            grace_months: params.grace_months,
            grace_interest_mode: params.grace_interest_mode,
            installments,
        })

        if (installmentAtMidRate >= desiredInstallment) {
            highRate = midRate
        } else {
            lowRate = midRate
        }
    }

    return highRate
}

export function calculateProposal(input: ProposalCalcInput): ProposalCalculation {
    const params: ProposalCalcParams = {
        ...DEFAULT_PARAMS,
        ...input.params
    }

    const qtdModulos = Number(input.dimensioning.qtd_modulos || 0)
    const potenciaModuloW = Number(input.dimensioning.potencia_modulo_w || 0)
    const indiceProducao = Number(input.dimensioning.indice_producao || 0)
    const fatorOversizing = Number(input.dimensioning.fator_oversizing || params.default_oversizing_factor)

    const kWp = (qtdModulos * potenciaModuloW) / 1000
    const kWhEstimado = (qtdModulos * potenciaModuloW * indiceProducao) / 1000

    const potenciaInversorStringInformada = Number(input.dimensioning.potencia_inversor_string_kw || 0)
    const qtdMicroSugerida = roundMode(qtdModulos / params.micro_per_modules_divisor, params.micro_rounding_mode)
    const qtdStringInformada = Number(input.dimensioning.qtd_inversor_string || 0)
    const qtdMicroInformada = Number(input.dimensioning.qtd_inversor_micro || 0)
    const qtdMicro = qtdMicroInformada > 0 ? qtdMicroInformada : qtdMicroSugerida
    const potMicroTotalKw = qtdMicro * params.micro_unit_power_kw

    const moduleCostPerWatt = Number(input.kit.module_cost_per_watt || 0)
    const cablingUnitCost = Number(input.kit.cabling_unit_cost || 0)
    const microUnitCost = Number(input.kit.micro_unit_cost || 0)
    const normalizedStringInverters = Array.isArray(input.dimensioning.string_inverters)
        ? input.dimensioning.string_inverters
            .map((item) => ({
                quantity: Number(item?.quantity || 0),
                unit_cost: Number(item?.unit_cost || 0),
                power_kw: Number(item?.power_kw || 0),
            }))
            .filter((item) =>
                Number.isFinite(item.quantity) &&
                item.quantity > 0 &&
                Number.isFinite(item.unit_cost) &&
                Number.isFinite(item.power_kw) &&
                item.power_kw > 0
            )
        : []
    const hasStringInverterRows = normalizedStringInverters.length > 0
    const qtdStringFromRows = normalizedStringInverters.reduce((acc, item) => acc + item.quantity, 0)
    const potStringFromRowsKw = normalizedStringInverters.reduce((acc, item) => acc + (item.power_kw * item.quantity), 0)
    const totalStringCostFromRows = normalizedStringInverters.reduce((acc, item) => acc + (item.unit_cost * item.quantity), 0)

    const potStringKw = hasStringInverterRows
        ? potStringFromRowsKw
        : potenciaInversorStringInformada > 0
            ? potenciaInversorStringInformada
            : (fatorOversizing ? kWp / fatorOversizing : 0)
    const qtdString = hasStringInverterRows
        ? qtdStringFromRows
        : qtdStringInformada > 0
            ? qtdStringInformada
            : 0
    const stringInverterTotalCost = hasStringInverterRows
        ? totalStringCostFromRows
        : Number(input.kit.string_inverter_total_cost || 0)
    const moduleUnitCost = moduleCostPerWatt * potenciaModuloW

    const custoModulosTotal = qtdModulos * (moduleUnitCost + cablingUnitCost)
    const custoInversorTotal = input.dimensioning.tipo_inversor === "STRING"
        ? stringInverterTotalCost
        : qtdMicro * microUnitCost
    const custoKit = custoModulosTotal + custoInversorTotal

    const qtdPlacasSolo = Number(input.structure.qtd_placas_solo || 0)
    const qtdPlacasTelhado = Number(input.structure.qtd_placas_telhado || 0)
    const valorUnitSolo = Number(input.structure.valor_unit_solo || 0)
    const valorUnitTelhado = Number(input.structure.valor_unit_telhado || 0)

    const valorEstruturaSolo = qtdPlacasSolo * valorUnitSolo
    const valorEstruturaTelhado = qtdPlacasTelhado * valorUnitTelhado
    const valorEstruturaTotal = valorEstruturaSolo + valorEstruturaTelhado

    const baseComEstrutura = custoKit + valorEstruturaSolo + valorEstruturaTelhado
    const somaComEstrutura = params.duplication_rule === "DUPLICATE_KIT_AND_SOLO_STRUCTURE"
        ? (custoKit + valorEstruturaSolo) * 2 + valorEstruturaTelhado
        : baseComEstrutura
    const margemPercentual = Number(input.margin.margem_percentual || 0)
    const margemValor = somaComEstrutura * margemPercentual

    const extrasTotal =
        Number(input.extras.valor_baterias || 0) +
        Number(input.extras.valor_adequacao_padrao || 0) +
        (input.extras.outros_extras || []).reduce((sum, extra) => sum + Number(extra.value || 0), 0)

    const totalBrutoAVista = somaComEstrutura + margemValor + extrasTotal

    const tradeMode: ProposalTradeMode = input.trade?.mode === "INSTALLMENTS" ? "INSTALLMENTS" : "TOTAL_VALUE"
    const tradeEnabled = Boolean(input.trade?.enabled)
    const tradeValueRaw = Number(input.trade?.value || 0)
    const tradeValue = Number.isFinite(tradeValueRaw) && tradeValueRaw > 0 ? tradeValueRaw : 0

    const appliedTradeOnTotal = tradeEnabled && tradeMode === "TOTAL_VALUE"
        ? Math.min(tradeValue, Math.max(totalBrutoAVista, 0))
        : 0
    const totalAVista = totalBrutoAVista - appliedTradeOnTotal

    const entradaValor = Number(input.finance.entrada_valor || 0)
    const carenciaMeses = Number(input.finance.carencia_meses || 0)
    const jurosMensal = Number(input.finance.juros_mensal || 0)
    const numParcelas = Number(input.finance.num_parcelas || 0)
    const totalBaloes = (input.finance.baloes || []).reduce((sum, b) => sum + Number(b.balao_valor || 0), 0)

    const maxInstallmentTrade = Math.max(totalAVista - entradaValor - totalBaloes, 0)
    const appliedTradeOnInstallments = tradeEnabled && tradeMode === "INSTALLMENTS" && input.finance.enabled
        ? Math.min(tradeValue, maxInstallmentTrade)
        : 0

    const entradaPercentual = totalAVista > 0 ? entradaValor / totalAVista : 0
    const valorFinanciado = Math.max(totalAVista - entradaValor - totalBaloes - appliedTradeOnInstallments, 0)
    const saldoPosCarencia = calculateFinancedBalanceAfterGrace({
        financed_value: valorFinanciado,
        monthly_rate: jurosMensal,
        grace_months: carenciaMeses,
        grace_interest_mode: params.grace_interest_mode,
    })
    const parcelaMensal = input.finance.enabled
        ? calculateInstallmentFromRate({
            financed_value: valorFinanciado,
            monthly_rate: jurosMensal,
            grace_months: carenciaMeses,
            grace_interest_mode: params.grace_interest_mode,
            installments: numParcelas,
        })
        : 0
    const totalPago = input.finance.enabled
        ? entradaValor + (parcelaMensal * numParcelas) + totalBaloes
        : totalAVista
    const jurosBase = totalAVista - appliedTradeOnInstallments
    const jurosPagos = Math.max(totalPago - jurosBase, 0)

    const output: ProposalCalcOutput = {
        dimensioning: {
            kWp,
            kWh_estimado: kWhEstimado,
            inversor: {
                tipo: input.dimensioning.tipo_inversor,
                pot_string_kw: potStringKw,
                qtd_string: qtdString,
                qtd_micro: qtdMicro,
                qtd_micro_sugerida: qtdMicroSugerida,
                pot_micro_total_kw: potMicroTotalKw
            }
        },
        kit: {
            custo_modulo_unitario: moduleUnitCost,
            custo_modulos_total: custoModulosTotal,
            custo_inversor_total: custoInversorTotal,
            custo_kit: custoKit
        },
        structure: {
            valor_estrutura_solo: valorEstruturaSolo,
            valor_estrutura_telhado: valorEstruturaTelhado,
            valor_estrutura_total: valorEstruturaTotal
        },
        margin: {
            margem_valor: margemValor
        },
        extras: {
            extras_total: extrasTotal
        },
        totals: {
            soma_com_estrutura: somaComEstrutura,
            total_a_vista: totalAVista,
            views: {
                view_valor_kit: custoKit,
                view_material: custoModulosTotal + valorEstruturaTotal
            }
        },
        finance: {
            entrada_percentual: entradaPercentual,
            valor_financiado: valorFinanciado,
            saldo_pos_carencia: saldoPosCarencia,
            parcela_mensal: parcelaMensal,
            total_pago: totalPago,
            juros_pagos: jurosPagos
        },
        trade: {
            enabled: tradeEnabled,
            mode: tradeMode,
            value: tradeValue,
            applied_total_value: appliedTradeOnTotal,
            applied_installments_value: appliedTradeOnInstallments,
        }
    }

    return { params, input, output }
}
