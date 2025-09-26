# 📋 CAMPOS COMPLETOS PARA INDICAÇÕES - RENTAL ENERGIAS

## 🎯 CONTEXTO
Sistema de indicações para energia solar com formulários dinâmicos para Pessoa Física (PF) e Pessoa Jurídica (PJ). Cada tipo tem campos específicos obrigatórios e opcionais.

---

## 📊 CAMPOS COMUNS (PF + PJ)

### ✅ **OBRIGATÓRIOS**
```typescript
interface CamposComuns {
  // Identificação básica
  codigoClienteEnergia: string;     // Código da conta de energia (único)
  tipoPessoa: 'PF' | 'PJ';         // Tipo de pessoa
  nomeCliente: string;             // Nome completo do cliente
  emailCliente: string;            // Email principal (validado)
  telefoneCliente: string;         // Telefone principal (formatado)
  
  // Localização
  endereco: string;                // Endereço completo
  cidade: string;                  // Cidade
  estado: string;                  // Estado (sigla: SP, RJ, etc.)
  cep: string;                     // CEP (formato: 00000-000)
  
  // Dados energéticos
  consumoMedioKwh: number;         // Consumo médio em kWh
  valorContaEnergia: number;       // Valor atual da conta em R$
  
  // Sistema
  vendedorId: string;              // ID do vendedor logado
  status: 'nova' | 'em_analise' | 'aprovada' | 'rejeitada';
  createdAt: Date;
  updatedAt: Date;
}
```

### 🔶 **OPCIONAIS**
```typescript
interface CamposOpcionaisComuns {
  observacoes?: string;            // Observações gerais
  motivoRejeicao?: string;         // Se rejeitada
  
  // Integração externa (preenchidos automaticamente)
  contratoId?: string;             // ID do contrato (Clicksign)
  contratoSignUrl?: string;        // URL de assinatura
  contratoStatus?: string;         // Status do contrato
  contratoEnviadoEm?: Date;        // Quando foi enviado
  contratoAssinadoEm?: Date;       // Quando foi assinado
  sprintHubId?: string;            // ID no SprintHub CRM
  points?: number;                 // Pontos no SprintHub
  stage?: string;                  // Estágio no SprintHub
  checkout?: boolean;              // Checkout realizado
}
```

---

## 👤 CAMPOS ESPECÍFICOS - PESSOA FÍSICA (PF)

### ✅ **OBRIGATÓRIOS PF**
```typescript
interface CamposPF {
  // Documentação pessoal
  cpfCnpj: string;                 // CPF (formato: 000.000.000-00)
  rg: string;                      // RG do titular
  
  // Contatos específicos
  whatsappSignatarioPF: string;    // WhatsApp do signatário
  telefoneCobrancaPF: string;      // Telefone para cobrança
  emailBoletos: string;            // Email para receber boletos
  
  // Dados da venda
  dataVendaPF: Date;               // Data da venda
  vendedorNomePF: string;          // Nome do vendedor
  vendedorTelefonePF: string;      // Telefone do vendedor
  vendedorCPF: string;             // CPF do vendedor
  
  // Consumo específico
  consumoMedioPF: number;          // Consumo médio específico PF
}
```

### 🔶 **OPCIONAIS PF**
```typescript
interface CamposOpcionaisPF {
  // URLs de documentos anexados
  documentoPessoalUrl?: string;    // Documento pessoal (RG/CNH)
  contasEnergiaPFUrl?: string;     // Contas de energia anteriores
  faturaEnergiaUrl?: string;       // Fatura atual (obrigatória via upload)
  documentoFotoUrl?: string;       // Documento com foto (obrigatório via upload)
}
```

### 📎 **DOCUMENTOS OBRIGATÓRIOS PF**
```typescript
interface DocumentosPF {
  faturaEnergia: File;             // Fatura de energia mais recente
  documentoComFoto: File;          // RG, CNH ou documento oficial com foto
}
```

---

## 🏢 CAMPOS ESPECÍFICOS - PESSOA JURÍDICA (PJ)

### ✅ **OBRIGATÓRIOS PJ**
```typescript
interface CamposPJ {
  // Dados da empresa
  nomeEmpresa: string;             // Razão social
  cnpj: string;                    // CNPJ (formato: 00.000.000/0000-00)
  cpfCnpj: string;                 // CNPJ (mesmo valor)
  
  // Endereço detalhado
  logradouro: string;              // Rua, avenida, etc.
  numero: string;                  // Número
  bairro: string;                  // Bairro
  complemento?: string;            // Complemento (opcional)
  
  // Representante legal
  representanteLegal: string;      // Nome do representante
  cpfRepresentante: string;        // CPF do representante
  rgRepresentante: string;         // RG do representante
  
  // Contatos específicos
  emailSignatario: string;         // Email do signatário
  emailFatura: string;             // Email para receber faturas
  telefoneCobranca: string;        // Telefone para cobrança
  whatsappSignatario: string;      // WhatsApp do signatário
  
  // Dados da instalação
  codigoInstalacao: string;        // Código da instalação na conta
  localizacaoUC: string;           // Localização da UC (endereço completo)
  
  // Dados da venda
  dataVenda: Date;                 // Data da venda
  vendedorNome: string;            // Nome do vendedor
  vendedorTelefone: string;        // Telefone do vendedor
  vendedorCNPJ: string;            // CNPJ do vendedor
}
```

### 🔶 **OPCIONAIS PJ**
```typescript
interface CamposOpcionaisPJ {
  // URLs de documentos anexados
  contaEnergiaUrl?: string;        // Conta de energia principal
  contratoSocialUrl?: string;      // Contrato social
  cartaoCNPJUrl?: string;          // Cartão CNPJ
  documentoRepresentanteUrl?: string; // Documento do representante
  contaEnergia2Url?: string;       // Conta adicional 2
  contaEnergia3Url?: string;       // Conta adicional 3
  contaEnergia4Url?: string;       // Conta adicional 4
  faturaEnergiaUrl?: string;       // Fatura atual (obrigatória via upload)
  documentoFotoUrl?: string;       // Documento com foto (obrigatório via upload)
}
```

### 📎 **DOCUMENTOS OBRIGATÓRIOS PJ**
```typescript
interface DocumentosPJ {
  faturaEnergia: File;             // Fatura de energia da empresa
  documentoComFoto: File;          // Documento do representante com foto
  contratoSocial: File;            // Contrato social da empresa
  cartaoCNPJ: File;                // Cartão CNPJ atualizado
  documentoRepresentante: File;    // RG/CNH do representante legal
}
```

---

## 🔍 VALIDAÇÕES IMPORTANTES

### **CPF/CNPJ**
```typescript
// PF: CPF obrigatório, formato 000.000.000-00
// PJ: CNPJ obrigatório, formato 00.000.000/0000-00
// Validar dígitos verificadores
```

### **Email**
```typescript
// Formato válido de email
// Domínios aceitos (sem restrição específica)
// Normalizar para lowercase
```

### **Telefone**
```typescript
// Formato: (00) 00000-0000 ou (00) 0000-0000
// Aceitar apenas números brasileiros
// Validar DDD válido
```

### **CEP**
```typescript
// Formato: 00000-000
// Validar se existe (integração com ViaCEP opcional)
```

### **Consumo e Valores**
```typescript
// consumoMedioKwh: número positivo, máximo 99999 kWh
// valorContaEnergia: número positivo, formato R$ 0.000,00
```

---

## 📋 FLUXO DE PREENCHIMENTO

### **1. Seleção do Tipo**
```
┌─ Pessoa Física (PF)
│  ├─ Campos comuns
│  ├─ Campos específicos PF
│  └─ Documentos PF
│
└─ Pessoa Jurídica (PJ)
   ├─ Campos comuns  
   ├─ Campos específicos PJ
   └─ Documentos PJ
```

### **2. Validação Dinâmica**
- Campos aparecem/desaparecem baseado no tipo selecionado
- Validação em tempo real
- Máscara automática para CPF/CNPJ/telefone/CEP

### **3. Upload de Documentos**
- Aceitar: PDF, JPG, PNG, JPEG
- Tamanho máximo: 10MB por arquivo
- Validação de tipo de arquivo
- Preview opcional

---

## 🎯 EXEMPLO DE IMPLEMENTAÇÃO

### **Schema Zod (TypeScript)**
```typescript
// Esquema base
const indicacaoBaseSchema = z.object({
  codigoClienteEnergia: z.string().min(1, 'Código obrigatório'),
  tipoPessoa: z.enum(['PF', 'PJ']),
  nomeCliente: z.string().min(1, 'Nome obrigatório'),
  emailCliente: z.string().email('Email inválido'),
  telefoneCliente: z.string().min(10, 'Telefone inválido'),
  // ... outros campos comuns
})

// Esquema para PF
const indicacaoPFSchema = indicacaoBaseSchema.extend({
  tipoPessoa: z.literal('PF'),
  cpfCnpj: z.string().min(11, 'CPF obrigatório'),
  rg: z.string().min(1, 'RG obrigatório'),
  whatsappSignatarioPF: z.string().min(10, 'WhatsApp obrigatório'),
  // ... outros campos PF
})

// Esquema para PJ  
const indicacaoPJSchema = indicacaoBaseSchema.extend({
  tipoPessoa: z.literal('PJ'),
  nomeEmpresa: z.string().min(1, 'Razão social obrigatória'),
  cnpj: z.string().min(14, 'CNPJ obrigatório'),
  representanteLegal: z.string().min(1, 'Representante obrigatório'),
  // ... outros campos PJ
})

// Schema discriminado
const indicacaoSchema = z.discriminatedUnion('tipoPessoa', [
  indicacaoPFSchema,
  indicacaoPJSchema,
])
```

### **Componente React**
```typescript
function FormIndicacao() {
  const [tipoPessoa, setTipoPessoa] = useState<'PF' | 'PJ'>('PF')
  
  return (
    <form>
      {/* Campos comuns sempre visíveis */}
      <CamposComuns />
      
      {/* Campos condicionais */}
      {tipoPessoa === 'PF' && <CamposPF />}
      {tipoPessoa === 'PJ' && <CamposPJ />}
      
      {/* Upload de documentos */}
      <DocumentosUpload tipoPessoa={tipoPessoa} />
    </form>
  )
}
```

---

**Use este prompt como referência completa para implementar o sistema de indicações!** 📋⚡
