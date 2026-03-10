import { redirect } from "next/navigation"

export default async function FinancialDorataPage() {
    redirect("/admin/financeiro?brand=dorata")
}
