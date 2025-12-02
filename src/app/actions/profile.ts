"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { z } from "zod"

const profileSchema = z.object({
    name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
    phone: z.string().min(10, "Telefone inválido"),
})

export async function updateProfile(prevState: any, formData: FormData) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autenticado" }
    }

    const name = formData.get("name") as string
    const phone = formData.get("phone") as string

    const validatedFields = profileSchema.safeParse({
        name,
        phone,
    })

    if (!validatedFields.success) {
        return {
            error: validatedFields.error.flatten().fieldErrors.name?.[0] ||
                validatedFields.error.flatten().fieldErrors.phone?.[0] ||
                "Dados inválidos",
        }
    }

    const supabaseAdmin = createSupabaseServiceClient()

    const { error } = await supabaseAdmin
        .from("users")
        .update({
            name: validatedFields.data.name,
            phone: validatedFields.data.phone,
        })
        .eq("id", user.id)

    if (error) {
        console.error("Erro ao atualizar perfil:", error)
        return { error: "Erro ao atualizar perfil" }
    }

    revalidatePath("/perfil")
    revalidatePath("/dashboard")
    revalidatePath("/admin/indicacoes") // Update admin table too

    return { success: "Perfil atualizado com sucesso!", error: undefined }
}
