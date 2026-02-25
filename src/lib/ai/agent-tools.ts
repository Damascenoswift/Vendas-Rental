import { supabaseAdmin } from "../supabase/admin"

export type AgentToolContext = {
    userId: string
    role?: string | null
    allowedBrands?: string[]
}

type KnowledgeContractType = "GERAL" | "RENTAL_PF" | "RENTAL_PJ" | "DORATA_PF" | "DORATA_PJ"

const SUPPORTED_CONTRACT_TYPES: KnowledgeContractType[] = [
    "GERAL",
    "RENTAL_PF",
    "RENTAL_PJ",
    "DORATA_PF",
    "DORATA_PJ",
]

const STOP_WORDS = new Set([
    "a",
    "ao",
    "aos",
    "as",
    "com",
    "como",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "para",
    "por",
    "qual",
    "que",
    "se",
    "sem",
    "sobre",
    "um",
    "uma",
    "me",
    "minha",
    "meu",
])

export const tools = [
    {
        name: "check_client_status",
        description: "Busca uma indicação/cliente por nome, e-mail, instalação ou código e retorna status resumido.",
        parameters: {
            type: "OBJECT",
            properties: {
                search_term: {
                    type: "STRING",
                    description: "Nome, e-mail, código de instalação ou código do cliente.",
                },
            },
            required: ["search_term"],
        },
    },
    {
        name: "get_daily_sales",
        description: "Retorna quantidade de indicações criadas hoje no escopo de marcas do usuário.",
        parameters: {
            type: "OBJECT",
            properties: {},
        },
    },
    {
        name: "search_knowledge_base",
        description: "Busca em FAQ, tutoriais e cláusulas de contrato da base interna. Use para dúvidas de uso do sistema, processo e contrato.",
        parameters: {
            type: "OBJECT",
            properties: {
                query: {
                    type: "STRING",
                    description: "Pergunta do usuário em linguagem natural.",
                },
                contract_type: {
                    type: "STRING",
                    description: "Opcional: GERAL, RENTAL_PF, RENTAL_PJ, DORATA_PF ou DORATA_PJ.",
                    enum: SUPPORTED_CONTRACT_TYPES,
                },
            },
            required: ["query"],
        },
    },
]

type KnowledgeTutorialRow = {
    id: string
    title: string
    summary: string | null
    module: string
    video_url: string
    tags: string[] | null
    allowed_roles: string[] | null
    allowed_brands: string[] | null
    sort_order: number
}

type KnowledgeFaqRow = {
    id: string
    module: string
    question: string
    answer: string
    keywords: string[] | null
    related_tutorial_id: string | null
    contract_types: string[] | null
    allowed_roles: string[] | null
    allowed_brands: string[] | null
    priority: number
}

type KnowledgeClauseRow = {
    id: string
    contract_type: string
    clause_code: string
    clause_title: string
    clause_text: string
    plain_explanation: string | null
    risks: string | null
    keywords: string[] | null
    allowed_roles: string[] | null
    allowed_brands: string[] | null
    version: number
}

function normalizeText(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
}

function tokenize(value: string) {
    const normalized = normalizeText(value)
    const pieces = normalized
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 2 && !STOP_WORDS.has(part))

    if (pieces.length > 0) {
        return Array.from(new Set(pieces)).slice(0, 20)
    }

    return normalized
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .slice(0, 10)
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
}

function hasIntersection(left: string[], right: string[]) {
    if (left.length === 0 || right.length === 0) return false
    const rightSet = new Set(right)
    return left.some((item) => rightSet.has(item))
}

function canAccessByRole(allowedRoles: unknown, role?: string | null) {
    const roles = toStringArray(allowedRoles)
    if (roles.length === 0) return true
    if (!role) return false
    return roles.includes(role)
}

function canAccessByBrand(allowedBrands: unknown, userBrands: string[]) {
    const brands = toStringArray(allowedBrands)
    if (brands.length === 0) return true
    return hasIntersection(brands, userBrands)
}

function parseContractType(value: unknown): KnowledgeContractType | null {
    if (typeof value !== "string") return null
    const upper = value.trim().toUpperCase()
    return SUPPORTED_CONTRACT_TYPES.includes(upper as KnowledgeContractType)
        ? (upper as KnowledgeContractType)
        : null
}

function inferContractType(query: string): KnowledgeContractType | null {
    const normalized = normalizeText(query)

    const hasRental = /\brental\b/.test(normalized)
    const hasDorata = /\bdorata\b/.test(normalized)
    const hasPf = /\bpf\b|pessoa fisica/.test(normalized)
    const hasPj = /\bpj\b|pessoa juridica/.test(normalized)

    if (hasRental && hasPf) return "RENTAL_PF"
    if (hasRental && hasPj) return "RENTAL_PJ"
    if (hasDorata && hasPf) return "DORATA_PF"
    if (hasDorata && hasPj) return "DORATA_PJ"

    return null
}

function mentionsContract(query: string) {
    const normalized = normalizeText(query)
    return /contrat|clausul|multa|vigencia|assinatura/.test(normalized)
}

function termScore(text: string, terms: string[]) {
    if (!text || terms.length === 0) return 0
    const normalized = normalizeText(text)
    let score = 0
    for (const term of terms) {
        if (normalized.includes(term)) score += 1
    }
    return score
}

function truncate(value: string | null | undefined, max = 360) {
    if (!value) return null
    if (value.length <= max) return value
    return `${value.slice(0, max - 3)}...`
}

async function checkClientStatus(searchTerm: string, context?: AgentToolContext) {
    const term = searchTerm.trim()
    if (!term) {
        return "Termo de busca vazio."
    }

    const cleanTerm = term.replace(/[,%_]/g, "").trim()
    if (!cleanTerm) {
        return "Termo inválido para busca."
    }

    let indicacoesQuery = supabaseAdmin
        .from("indicacoes")
        .select("id, nome, email, telefone, status, marca, codigo_instalacao, codigo_cliente, created_at")
        .or(
            [
                `nome.ilike.%${cleanTerm}%`,
                `email.ilike.%${cleanTerm}%`,
                `codigo_instalacao.ilike.%${cleanTerm}%`,
                `codigo_cliente.ilike.%${cleanTerm}%`,
            ].join(",")
        )
        .order("created_at", { ascending: false })
        .limit(5)

    const allowedBrands = toStringArray(context?.allowedBrands)
    if (allowedBrands.length > 0) {
        indicacoesQuery = indicacoesQuery.in("marca", allowedBrands)
    }

    const { data: indicacoes, error: indicacoesError } = await indicacoesQuery

    if (indicacoesError) {
        return `Erro ao buscar indicação: ${indicacoesError.message}`
    }

    if (indicacoes && indicacoes.length > 0) {
        const list = indicacoes
            .map((item) => {
                return [
                    `- Nome: ${item.nome}`,
                    `  Status: ${item.status}`,
                    `  Marca: ${item.marca ?? "n/d"}`,
                    `  Email: ${item.email ?? "n/d"}`,
                    `  Telefone: ${item.telefone ?? "n/d"}`,
                    `  Instalação: ${item.codigo_instalacao ?? "n/d"}`,
                    `  Código cliente: ${item.codigo_cliente ?? "n/d"}`,
                ].join("\n")
            })
            .join("\n\n")

        return `Resultados de indicação para "${term}":\n${list}`
    }

    const { data: contacts, error: contactsError } = await supabaseAdmin
        .from("contacts")
        .select("id, full_name, email, phone, whatsapp, city, state, updated_at")
        .or(
            [
                `full_name.ilike.%${cleanTerm}%`,
                `email.ilike.%${cleanTerm}%`,
                `whatsapp.ilike.%${cleanTerm}%`,
                `phone.ilike.%${cleanTerm}%`,
            ].join(",")
        )
        .order("updated_at", { ascending: false })
        .limit(5)

    if (contactsError) {
        return `Erro ao buscar contato: ${contactsError.message}`
    }

    if (!contacts || contacts.length === 0) {
        return `Nenhum cliente/contato encontrado para "${term}".`
    }

    const list = contacts
        .map((item) => {
            return [
                `- Nome: ${item.full_name ?? "n/d"}`,
                `  Email: ${item.email ?? "n/d"}`,
                `  Telefone: ${item.phone ?? item.whatsapp ?? "n/d"}`,
                `  Cidade/UF: ${item.city ?? "n/d"}/${item.state ?? "n/d"}`,
            ].join("\n")
        })
        .join("\n\n")

    return `Resultados de contato para "${term}":\n${list}`
}

async function getDailySales(context?: AgentToolContext) {
    const today = new Date().toISOString().split("T")[0]

    let query = supabaseAdmin
        .from("indicacoes")
        .select("id", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00`)

    const allowedBrands = toStringArray(context?.allowedBrands)
    if (allowedBrands.length > 0) {
        query = query.in("marca", allowedBrands)
    }

    const { count, error } = await query

    if (error) {
        return `Erro ao buscar vendas do dia: ${error.message}`
    }

    const brandsLabel = allowedBrands.length > 0 ? allowedBrands.join(", ") : "todas as marcas"
    return `Total de indicações hoje (${today}) em ${brandsLabel}: ${count ?? 0}`
}

async function searchKnowledgeBase(rawQuery: string, rawContractType: unknown, context?: AgentToolContext) {
    const query = rawQuery.trim()
    if (!query) {
        return "Pergunta vazia para consulta na base de conhecimento."
    }

    const userRole = context?.role ?? null
    const userBrands = toStringArray(context?.allowedBrands)
    const terms = tokenize(query)
    const explicitContractType = parseContractType(rawContractType)
    const inferredContractType = inferContractType(query)
    const effectiveContractType = explicitContractType ?? inferredContractType
    const questionMentionsContract = mentionsContract(query)

    const clausesContractFilter = effectiveContractType ? ["GERAL", effectiveContractType] : null

    const tutorialsPromise = supabaseAdmin
        .from("knowledge_tutorials")
        .select("id, title, summary, module, video_url, tags, allowed_roles, allowed_brands, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(200)

    const faqPromise = supabaseAdmin
        .from("knowledge_faq")
        .select("id, module, question, answer, keywords, related_tutorial_id, contract_types, allowed_roles, allowed_brands, priority")
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .limit(200)

    let clausesQuery = supabaseAdmin
        .from("knowledge_contract_clauses")
        .select("id, contract_type, clause_code, clause_title, clause_text, plain_explanation, risks, keywords, allowed_roles, allowed_brands, version")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(200)

    if (clausesContractFilter) {
        clausesQuery = clausesQuery.in("contract_type", clausesContractFilter)
    }

    const [tutorialsResult, faqResult, clausesResult] = await Promise.all([
        tutorialsPromise,
        faqPromise,
        clausesQuery,
    ])

    if (tutorialsResult.error) {
        return `Erro ao consultar tutoriais: ${tutorialsResult.error.message}`
    }

    if (faqResult.error) {
        return `Erro ao consultar FAQ: ${faqResult.error.message}`
    }

    if (clausesResult.error) {
        return `Erro ao consultar cláusulas de contrato: ${clausesResult.error.message}`
    }

    const tutorials = (tutorialsResult.data ?? []) as KnowledgeTutorialRow[]
    const faqRows = (faqResult.data ?? []) as KnowledgeFaqRow[]
    const clauseRows = (clausesResult.data ?? []) as KnowledgeClauseRow[]

    const visibleTutorials = tutorials.filter((row) => {
        return canAccessByRole(row.allowed_roles, userRole) && canAccessByBrand(row.allowed_brands, userBrands)
    })

    const tutorialById = new Map(visibleTutorials.map((row) => [row.id, row]))

    const visibleFaq = faqRows.filter((row) => {
        if (!canAccessByRole(row.allowed_roles, userRole) || !canAccessByBrand(row.allowed_brands, userBrands)) {
            return false
        }

        const contractTypes = toStringArray(row.contract_types)
        if (contractTypes.length === 0) return true

        if (!effectiveContractType) {
            return contractTypes.includes("GERAL")
        }

        return contractTypes.includes(effectiveContractType) || contractTypes.includes("GERAL")
    })

    const visibleClauses = clauseRows.filter((row) => {
        if (!canAccessByRole(row.allowed_roles, userRole) || !canAccessByBrand(row.allowed_brands, userBrands)) {
            return false
        }

        if (!effectiveContractType) {
            return questionMentionsContract ? true : row.contract_type === "GERAL"
        }

        return row.contract_type === effectiveContractType || row.contract_type === "GERAL"
    })

    const rankedFaq = visibleFaq
        .map((row) => {
            const score =
                termScore(row.question, terms) * 6 +
                termScore(row.answer, terms) * 3 +
                termScore((row.keywords ?? []).join(" "), terms) * 5 +
                termScore(row.module, terms) * 2 +
                Math.max(0, Math.min(row.priority ?? 0, 5)) +
                (row.related_tutorial_id ? 1 : 0)

            const contractTypes = toStringArray(row.contract_types)
            const contractBonus =
                effectiveContractType && contractTypes.includes(effectiveContractType)
                    ? 6
                    : contractTypes.includes("GERAL")
                      ? 1
                      : 0

            return {
                row,
                score: score + contractBonus,
            }
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 4)

    const rankedClauses = visibleClauses
        .map((row) => {
            const score =
                termScore(row.clause_title, terms) * 7 +
                termScore(row.clause_text, terms) * 2 +
                termScore(row.plain_explanation ?? "", terms) * 4 +
                termScore((row.keywords ?? []).join(" "), terms) * 5 +
                termScore(row.clause_code, terms) * 3 +
                (questionMentionsContract ? 2 : 0)

            const contractBonus =
                effectiveContractType && row.contract_type === effectiveContractType
                    ? 8
                    : row.contract_type === "GERAL"
                      ? 2
                      : 0

            return {
                row,
                score: score + contractBonus,
            }
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 4)

    const rankedTutorials = visibleTutorials
        .map((row) => {
            const score =
                termScore(row.title, terms) * 6 +
                termScore(row.summary ?? "", terms) * 3 +
                termScore((row.tags ?? []).join(" "), terms) * 4 +
                termScore(row.module, terms) * 2 +
                (row.sort_order <= 0 ? 1 : 0)

            return {
                row,
                score,
            }
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 4)

    if (rankedFaq.length === 0 && rankedClauses.length === 0 && rankedTutorials.length === 0) {
        return [
            "Nenhuma resposta de alta confiança encontrada na base de conhecimento.",
            "Sugestão: peça mais contexto ao usuário e, se necessário, encaminhe para o responsável da área.",
        ].join("\n")
    }

    const payload = {
        query,
        contract_type: effectiveContractType,
        counts: {
            faq: rankedFaq.length,
            contract_clauses: rankedClauses.length,
            tutorials: rankedTutorials.length,
        },
        faq: rankedFaq.map((item) => {
            const tutorial = item.row.related_tutorial_id
                ? tutorialById.get(item.row.related_tutorial_id)
                : undefined

            return {
                id: item.row.id,
                score: item.score,
                module: item.row.module,
                question: item.row.question,
                answer: truncate(item.row.answer, 420),
                related_tutorial: tutorial
                    ? {
                          id: tutorial.id,
                          title: tutorial.title,
                          video_url: tutorial.video_url,
                      }
                    : null,
            }
        }),
        contract_clauses: rankedClauses.map((item) => ({
            id: item.row.id,
            score: item.score,
            contract_type: item.row.contract_type,
            clause_code: item.row.clause_code,
            clause_title: item.row.clause_title,
            clause_text: truncate(item.row.clause_text, 460),
            plain_explanation: truncate(item.row.plain_explanation, 300),
            risks: truncate(item.row.risks, 220),
            version: item.row.version,
        })),
        tutorials: rankedTutorials.map((item) => ({
            id: item.row.id,
            score: item.score,
            module: item.row.module,
            title: item.row.title,
            summary: truncate(item.row.summary, 220),
            video_url: item.row.video_url,
            tags: item.row.tags ?? [],
        })),
        citation_rule:
            "Use os campos id/clause_code/video_url como referência na resposta final e não invente informações fora desses resultados.",
    }

    return JSON.stringify(payload, null, 2)
}

export async function runTool(toolName: string, args: Record<string, unknown>, context?: AgentToolContext) {
    switch (toolName) {
        case "check_client_status":
            return await checkClientStatus(typeof args.search_term === "string" ? args.search_term : "", context)
        case "get_daily_sales":
            return await getDailySales(context)
        case "search_knowledge_base":
            return await searchKnowledgeBase(typeof args.query === "string" ? args.query : "", args.contract_type, context)
        default:
            return `Tool ${toolName} não encontrada.`
    }
}
