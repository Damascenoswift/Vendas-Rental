import { redirect } from "next/navigation"

export default async function FinancialRentalPage() {
    redirect("/admin/financeiro?brand=rental")
}
