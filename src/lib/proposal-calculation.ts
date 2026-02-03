export type RoundMode = "CEIL" | "FLOOR" | "ROUND"
export type GraceInterestMode = "COMPOUND" | "SIMPLE"

export type ProposalCalcParams = {
    default_oversizing_factor: number
    micro_per_modules_divisor: number
    micro_unit_power_kw: number
    micro_rounding_mode: RoundMode
    grace_interest_mode: GraceInterestMode
    duplication_rule: "DUPLICATE_KIT_AND_SOLO_STRUCTURE"
}

export type ProposalCalcInput = {
    dimensioning: {
        qtd_modulos: number
        potencia_modulo_w: number
        indice_producao: number
        tipo_inversor: "STRING" | "MICRO"
        fator_oversizing: number
    }
    kit: {
        module_unit_cost: number
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
    params?: Partial<ProposalCalcParams>
}

export type ProposalCalcOutput = {
    dimensioning: {
        kWp: number
        kWh_estimado: number
        inversor: {
            pot_string_kw: number
            qtd_micro: number
            pot_micro_total_kw: number
        }
    }
    kit: {
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

    const potStringKw = fatorOversizing ? kWp / fatorOversizing : 0
    const qtdMicro = roundMode(qtdModulos / params.micro_per_modules_divisor, params.micro_rounding_mode)
    const potMicroTotalKw = qtdMicro * params.micro_unit_power_kw

    const moduleUnitCost = Number(input.kit.module_unit_cost || 0)
    const cablingUnitCost = Number(input.kit.cabling_unit_cost || 0)
    const microUnitCost = Number(input.kit.micro_unit_cost || 0)
    const stringInverterTotalCost = Number(input.kit.string_inverter_total_cost || 0)

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

    const somaComEstrutura = (custoKit + valorEstruturaSolo) * 2 + valorEstruturaTelhado
    const margemPercentual = Number(input.margin.margem_percentual || 0)
    const margemValor = somaComEstrutura * margemPercentual

    const extrasTotal =
        Number(input.extras.valor_baterias || 0) +
        Number(input.extras.valor_adequacao_padrao || 0) +
        (input.extras.outros_extras || []).reduce((sum, extra) => sum + Number(extra.value || 0), 0)

    const totalAVista = somaComEstrutura + margemValor + extrasTotal

    const entradaValor = Number(input.finance.entrada_valor || 0)
    const carenciaMeses = Number(input.finance.carencia_meses || 0)
    const jurosMensal = Number(input.finance.juros_mensal || 0)
    const numParcelas = Number(input.finance.num_parcelas || 0)
    const totalBaloes = (input.finance.baloes || []).reduce((sum, b) => sum + Number(b.balao_valor || 0), 0)

    const entradaPercentual = totalAVista > 0 ? entradaValor / totalAVista : 0
    const valorFinanciado = totalAVista - entradaValor - totalBaloes
    const saldoPosCarencia = params.grace_interest_mode === "COMPOUND"
        ? valorFinanciado * Math.pow(1 + jurosMensal, carenciaMeses)
        : valorFinanciado * (1 + jurosMensal * carenciaMeses)
    const parcelaMensal = input.finance.enabled ? pmt(jurosMensal, numParcelas, saldoPosCarencia) : 0
    const totalPago = input.finance.enabled
        ? entradaValor + (parcelaMensal * numParcelas) + totalBaloes
        : totalAVista
    const jurosPagos = totalPago - totalAVista

    const output: ProposalCalcOutput = {
        dimensioning: {
            kWp,
            kWh_estimado: kWhEstimado,
            inversor: {
                pot_string_kw: potStringKw,
                qtd_micro: qtdMicro,
                pot_micro_total_kw: potMicroTotalKw
            }
        },
        kit: {
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
        }
    }

    return { params, input, output }
}
