import { describe, expect, it } from "vitest"
import { calculateProposal } from "../proposal-calculation"

describe("calculateProposal - índices de produção múltiplos", () => {
    it("mantém o cálculo atual quando não há múltiplos índices", () => {
        const calculation = calculateProposal({
            dimensioning: {
                qtd_modulos: 20,
                potencia_modulo_w: 620,
                indice_producao: 112,
                tipo_inversor: "STRING",
                fator_oversizing: 1,
                qtd_inversor_string: 1,
            },
            kit: {
                module_cost_per_watt: 0,
                cabling_unit_cost: 0,
                micro_unit_cost: 0,
                string_inverter_total_cost: 0,
            },
            structure: {
                qtd_placas_solo: 0,
                qtd_placas_telhado: 0,
                valor_unit_solo: 0,
                valor_unit_telhado: 0,
            },
            margin: {
                margem_percentual: 0,
            },
            extras: {
                valor_baterias: 0,
                valor_adequacao_padrao: 0,
                outros_extras: [],
            },
            finance: {
                enabled: false,
                entrada_valor: 0,
                carencia_meses: 0,
                juros_mensal: 0,
                num_parcelas: 0,
                baloes: [],
            },
            commercial: {
                tarifa_kwh: 1,
            },
        })

        expect(calculation.output.dimensioning.kWh_estimado).toBeCloseTo(1388.8, 6)
    })

    it("calcula o kWh estimado usando índice efetivo ponderado por quantidade de módulos", () => {
        const calculation = calculateProposal({
            dimensioning: {
                qtd_modulos: 20,
                potencia_modulo_w: 620,
                indice_producao: 90,
                tipo_inversor: "STRING",
                fator_oversizing: 1,
                qtd_inversor_string: 1,
                indices_producao_multiplos: [
                    { label: "Norte", qtd_modulos: 10, indice_producao: 120 },
                    { label: "Sul", qtd_modulos: 10, indice_producao: 100 },
                ],
            },
            kit: {
                module_cost_per_watt: 0,
                cabling_unit_cost: 0,
                micro_unit_cost: 0,
                string_inverter_total_cost: 0,
            },
            structure: {
                qtd_placas_solo: 0,
                qtd_placas_telhado: 0,
                valor_unit_solo: 0,
                valor_unit_telhado: 0,
            },
            margin: {
                margem_percentual: 0,
            },
            extras: {
                valor_baterias: 0,
                valor_adequacao_padrao: 0,
                outros_extras: [],
            },
            finance: {
                enabled: false,
                entrada_valor: 0,
                carencia_meses: 0,
                juros_mensal: 0,
                num_parcelas: 0,
                baloes: [],
            },
            commercial: {
                tarifa_kwh: 1,
            },
        })

        expect(calculation.output.dimensioning.kWh_estimado).toBeCloseTo(1364, 6)
    })
})
