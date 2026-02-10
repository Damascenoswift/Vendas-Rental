BEGIN;

INSERT INTO pricing_rules (name, key, value, unit, description)
VALUES
    (
        'Percentual comissão Rental (padrão)',
        'rental_default_commission_percent',
        3.00,
        '%',
        'Percentual padrão de comissão Rental aplicado quando não houver regra por vendedor'
    ),
    (
        'Percentual override gestor Rental',
        'rental_manager_override_percent',
        3.00,
        '%',
        'Percentual de override do gestor comercial sobre vendas Rental de outros vendedores'
    )
ON CONFLICT (key) DO NOTHING;

COMMIT;

