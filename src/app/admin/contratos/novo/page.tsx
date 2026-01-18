import { NewContractForm } from "@/components/admin/contracts/new-contract-form"

export default function NewContractPage() {
    return (
        <div className="container mx-auto py-10 max-w-5xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Novo Contrato Automático</h1>
                <p className="text-muted-foreground">
                    Preencha os dados de consumo para gerar a minuta contratual.
                </p>
            </div>

            <NewContractForm />
        </div>
    )
}
