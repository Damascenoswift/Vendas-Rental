BEGIN;

INSERT INTO pricing_rules (name, key, value, unit, description)
VALUES
    ('Percentual comissao Dorata', 'dorata_commission_percent', 3.00, '%', 'Percentual de comissao sobre o valor do contrato'),
    ('Potencia modulo padrao (W)', 'potencia_modulo_w', 700, 'W', 'Potencia padrao do modulo'),
    ('Indice de producao', 'indice_producao', 112, 'kWh', 'Indice base de producao'),
    ('Fator de oversizing', 'default_oversizing_factor', 1.25, 'x', 'Fator de oversizing padrao'),
    ('Micro inversor por modulos', 'micro_per_modules_divisor', 4, 'modulos', 'Quantidade de modulos por micro inversor'),
    ('Potencia micro inversor (kW)', 'micro_unit_power_kw', 2, 'kW', 'Potencia unitaria do micro inversor'),
    ('Custo modulo unitario', 'module_unit_cost', 0, 'R$', 'Custo unitario do modulo'),
    ('Custo cabeamento por modulo', 'cabling_unit_cost', 0, 'R$', 'Custo de cabling por modulo'),
    ('Custo micro inversor unitario', 'micro_unit_cost', 0, 'R$', 'Custo unitario do micro inversor'),
    ('Custo total inversor string', 'string_inverter_total_cost', 0, 'R$', 'Custo total do(s) inversor(es) string'),
    ('Valor estrutura solo unitario', 'valor_unit_solo', 0, 'R$', 'Valor por placa para estrutura solo'),
    ('Valor estrutura telhado unitario', 'valor_unit_telhado', 0, 'R$', 'Valor por placa para estrutura telhado'),
    ('Margem percentual', 'margem_percentual', 10, '%', 'Margem percentual aplicada ao total base'),
    ('Juros mensal', 'juros_mensal', 1.9, '%', 'Juros mensal do financiamento')
ON CONFLICT (key) DO NOTHING;

COMMIT;
