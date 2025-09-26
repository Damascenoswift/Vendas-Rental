# 🚀 PROMPT PARA CURSOR - SISTEMA DE INDICAÇÕES

## CONTEXTO
Sistema de indicações de energia solar com formulários dinâmicos para PF (Pessoa Física) e PJ (Pessoa Jurídica).

## CAMPOS OBRIGATÓRIOS COMUNS (PF + PJ)

```typescript
interface IndicacaoBase {
  codigoClienteEnergia: string;    // Código da conta de energia
  tipoPessoa: 'PF' | 'PJ';        // Tipo de pessoa
  nomeCliente: string;            // Nome completo
  emailCliente: string;           // Email (validado)
  telefoneCliente: string;        // Telefone (11) 99999-9999
  endereco: string;               // Endereço completo
  cidade: string;                 // Cidade
  estado: string;                 // Estado (SP, RJ, etc.)
  cep: string;                    // CEP 00000-000
  consumoMedioKwh: number;        // Consumo em kWh
  valorContaEnergia: number;      // Valor da conta R$
  vendedorId: string;             // ID do vendedor
  status: 'nova' | 'em_analise' | 'aprovada' | 'rejeitada';
}
```

## CAMPOS ESPECÍFICOS PESSOA FÍSICA (PF)

```typescript
interface CamposPF {
  // OBRIGATÓRIOS PF
  cpfCnpj: string;                // CPF 000.000.000-00
  rg: string;                     // RG
  whatsappSignatarioPF: string;   // WhatsApp (11) 99999-9999
  telefoneCobrancaPF: string;     // Telefone cobrança
  emailBoletos: string;           // Email para boletos
  dataVendaPF: Date;              // Data da venda
  vendedorNomePF: string;         // Nome vendedor
  vendedorTelefonePF: string;     // Telefone vendedor
  vendedorCPF: string;            // CPF vendedor
  consumoMedioPF: number;         // Consumo específico PF
}

// DOCUMENTOS OBRIGATÓRIOS PF
interface DocumentosPF {
  faturaEnergia: File;            // Fatura de energia
  documentoComFoto: File;         // RG/CNH com foto
}
```

## CAMPOS ESPECÍFICOS PESSOA JURÍDICA (PJ)

```typescript
interface CamposPJ {
  // OBRIGATÓRIOS PJ
  nomeEmpresa: string;            // Razão social
  cnpj: string;                   // CNPJ 00.000.000/0000-00
  cpfCnpj: string;                // CNPJ (mesmo valor)
  logradouro: string;             // Rua/avenida
  numero: string;                 // Número
  bairro: string;                 // Bairro
  complemento?: string;           // Complemento (opcional)
  representanteLegal: string;     // Nome representante
  cpfRepresentante: string;       // CPF representante
  rgRepresentante: string;        // RG representante
  emailSignatario: string;        // Email signatário
  emailFatura: string;            // Email fatura
  telefoneCobranca: string;       // Telefone cobrança
  whatsappSignatario: string;     // WhatsApp signatário
  codigoInstalacao: string;       // Código instalação
  localizacaoUC: string;          // Localização UC
  dataVenda: Date;                // Data venda
  vendedorNome: string;           // Nome vendedor
  vendedorTelefone: string;       // Telefone vendedor
  vendedorCNPJ: string;           // CNPJ vendedor
}

// DOCUMENTOS OBRIGATÓRIOS PJ
interface DocumentosPJ {
  faturaEnergia: File;            // Fatura empresa
  documentoComFoto: File;         // Doc representante com foto
  contratoSocial: File;           // Contrato social
  cartaoCNPJ: File;               // Cartão CNPJ
  documentoRepresentante: File;   // RG/CNH representante
}
```

## VALIDAÇÕES IMPORTANTES

```typescript
// CPF: formato 000.000.000-00, validar dígitos
// CNPJ: formato 00.000.000/0000-00, validar dígitos
// Email: formato válido, converter para lowercase
// Telefone: (00) 00000-0000, validar DDD
// CEP: 00000-000
// Consumo: número positivo, max 99999 kWh
// Valor: número positivo, formato R$
```

## FLUXO DO FORMULÁRIO

```typescript
// 1. Seleção PF/PJ
const [tipoPessoa, setTipoPessoa] = useState<'PF' | 'PJ'>('PF')

// 2. Campos dinâmicos
{tipoPessoa === 'PF' ? <CamposPF /> : <CamposPJ />}

// 3. Upload documentos
<DocumentosUpload tipoPessoa={tipoPessoa} />

// 4. Validação Zod
const schema = tipoPessoa === 'PF' ? schemaPF : schemaPJ
```

## SCHEMA ZOD EXEMPLO

```typescript
const indicacaoPFSchema = z.object({
  tipoPessoa: z.literal('PF'),
  codigoClienteEnergia: z.string().min(1),
  nomeCliente: z.string().min(1),
  emailCliente: z.string().email(),
  telefoneCliente: z.string().min(10),
  cpfCnpj: z.string().min(11),
  rg: z.string().min(1),
  whatsappSignatarioPF: z.string().min(10),
  // ... outros campos
})

const indicacaoPJSchema = z.object({
  tipoPessoa: z.literal('PJ'),
  nomeEmpresa: z.string().min(1),
  cnpj: z.string().min(14),
  representanteLegal: z.string().min(1),
  // ... outros campos
})

const indicacaoSchema = z.discriminatedUnion('tipoPessoa', [
  indicacaoPFSchema,
  indicacaoPJSchema,
])
```

## MÁSCARAS DE INPUT

```typescript
// CPF: 000.000.000-00
// CNPJ: 00.000.000/0000-00  
// Telefone: (00) 00000-0000
// CEP: 00000-000
// Valor: R$ 0.000,00
```

## UPLOAD DE ARQUIVOS

```typescript
// Aceitar: PDF, JPG, PNG, JPEG
// Tamanho máximo: 10MB
// Validação de tipo
// Preview opcional

interface FileUpload {
  accept: '.pdf,.jpg,.jpeg,.png';
  maxSize: 10 * 1024 * 1024; // 10MB
  required: boolean;
}
```

---

**RESUMO: Sistema com formulário dinâmico PF/PJ, validação Zod, upload de documentos, máscaras automáticas e campos condicionais baseados no tipo selecionado.** 📋⚡
