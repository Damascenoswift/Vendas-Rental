BEGIN;

INSERT INTO pricing_rules (name, key, value, unit, description)
SELECT
    'Custo modulo por watt',
    'module_cost_per_watt',
    COALESCE(
        (
            SELECT ROUND((old_rule.value / NULLIF(power_rule.value, 0))::numeric, 4)
            FROM pricing_rules old_rule
            JOIN pricing_rules power_rule ON power_rule.key = 'potencia_modulo_w'
            WHERE old_rule.key = 'module_unit_cost'
            LIMIT 1
        ),
        0.72
    ),
    'R$/W',
    'Custo base por watt para calculo do modulo'
WHERE NOT EXISTS (
    SELECT 1
    FROM pricing_rules
    WHERE key = 'module_cost_per_watt'
);

DELETE FROM pricing_rules
WHERE key = 'module_unit_cost';

COMMIT;
