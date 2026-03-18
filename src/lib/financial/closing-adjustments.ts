export type FinancialClosingBrand = 'rental' | 'dorata'

type FinancialClosingSourceKind = 'rental_sistema' | 'dorata_sistema'

export type OptionalClosingItem = {
  source_kind: FinancialClosingSourceKind
  source_ref_id: string
  brand: FinancialClosingBrand
  beneficiary_user_id: string
  transaction_type: 'comissao_venda' | 'comissao_dorata' | 'despesa'
  amount: number
  description: string
  origin_lead_id: null
  client_name: string
}

type BuildOptionalClosingItemsInput = {
  applyExpense: boolean
  expenseBeneficiary: string
  expenseBrand: string
  expenseDescription: string
  expenseAmount: FormDataEntryValue | null | undefined
  applyFixedPayment: boolean
  fixedBeneficiary: string
  fixedBrand: string
  fixedDescription: string
  fixedAmount: FormDataEntryValue | null | undefined
  createId?: () => string
}

type BuildOptionalClosingItemsResult =
  | { ok: true; items: OptionalClosingItem[] }
  | { ok: false; error: 'invalid-expense' | 'invalid-fixed' }

function parseBrand(rawValue: string): FinancialClosingBrand | null {
  const normalized = rawValue.trim().toLowerCase()
  if (normalized === 'rental' || normalized === 'dorata') return normalized
  return null
}

function sourceKindFromBrand(brand: FinancialClosingBrand): FinancialClosingSourceKind {
  return brand === 'dorata' ? 'dorata_sistema' : 'rental_sistema'
}

export function parseFinancialDecimal(value: FormDataEntryValue | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN
  }

  const raw = String(value ?? '').trim()
  if (!raw) return Number.NaN

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function buildOptionalClosingItems(input: BuildOptionalClosingItemsInput): BuildOptionalClosingItemsResult {
  const items: OptionalClosingItem[] = []
  const createId = input.createId ?? (() => crypto.randomUUID())

  if (input.applyExpense) {
    const expenseAmount = parseFinancialDecimal(input.expenseAmount)
    const expenseBrand = parseBrand(input.expenseBrand)
    const expenseDescription = input.expenseDescription.trim()

    if (
      !input.expenseBeneficiary ||
      !expenseBrand ||
      !expenseDescription ||
      !Number.isFinite(expenseAmount) ||
      expenseAmount <= 0
    ) {
      return { ok: false, error: 'invalid-expense' }
    }

    items.push({
      source_kind: sourceKindFromBrand(expenseBrand),
      source_ref_id: `manual_expense:${createId()}`,
      brand: expenseBrand,
      beneficiary_user_id: input.expenseBeneficiary,
      transaction_type: 'despesa',
      amount: Number(expenseAmount.toFixed(2)),
      description: `Despesa fechamento - ${expenseDescription}`,
      origin_lead_id: null,
      client_name: 'Despesa financeira',
    })
  }

  if (input.applyFixedPayment) {
    const fixedAmount = parseFinancialDecimal(input.fixedAmount)
    const fixedBrand = parseBrand(input.fixedBrand)
    const fixedDescription = input.fixedDescription.trim()

    if (
      !input.fixedBeneficiary ||
      !fixedBrand ||
      !Number.isFinite(fixedAmount) ||
      fixedAmount <= 0
    ) {
      return { ok: false, error: 'invalid-fixed' }
    }

    items.push({
      source_kind: sourceKindFromBrand(fixedBrand),
      source_ref_id: `manual_fixed:${createId()}`,
      brand: fixedBrand,
      beneficiary_user_id: input.fixedBeneficiary,
      transaction_type: fixedBrand === 'dorata' ? 'comissao_dorata' : 'comissao_venda',
      amount: Number(fixedAmount.toFixed(2)),
      description: fixedDescription ? `Pagamento fixo - ${fixedDescription}` : 'Pagamento fixo',
      origin_lead_id: null,
      client_name: 'Pagamento fixo',
    })
  }

  return { ok: true, items }
}
