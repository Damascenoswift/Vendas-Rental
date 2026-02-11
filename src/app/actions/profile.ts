"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase-server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

const profileSchema = z.object({
    name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
    phone: z.string().min(10, "Telefone inválido"),
    company_name: z.string().optional(),
    supervised_company_name: z.string().optional(),
})

const passwordSchema = z.object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: z.string().min(6, "A nova senha deve ter no mínimo 6 caracteres"),
    confirmPassword: z.string().min(6, "A confirmação da senha deve ter no mínimo 6 caracteres"),
}).refine((value) => value.newPassword === value.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
})

type ProfileActionState = {
    error?: string
    success?: string
}

export async function updateProfile(
    prevState: ProfileActionState,
    formData: FormData
): Promise<ProfileActionState> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autenticado" }
    }

    const name = formData.get("name") as string
    const phone = formData.get("phone") as string
    const companyName = (formData.get("company_name") as string | null) ?? ""
    const supervisedCompanyName = (formData.get("supervised_company_name") as string | null) ?? ""

    const validatedFields = profileSchema.safeParse({
        name,
        phone,
        company_name: companyName.trim() || undefined,
        supervised_company_name: supervisedCompanyName.trim() || undefined,
    })

    if (!validatedFields.success) {
        return {
            error: validatedFields.error.flatten().fieldErrors.name?.[0] ||
                validatedFields.error.flatten().fieldErrors.phone?.[0] ||
                "Dados inválidos",
        }
    }

    const supabaseAdmin = createSupabaseServiceClient()
    const { data: currentProfile, error: currentProfileError } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single()

    if (currentProfileError || !currentProfile) {
        console.error("Erro ao buscar função do perfil:", currentProfileError)
        return { error: "Erro ao validar perfil antes da atualização." }
    }

    const updatePayload: Record<string, string | null> = {
        name: validatedFields.data.name,
        phone: validatedFields.data.phone,
    }

    if (currentProfile.role === "vendedor_interno") {
        updatePayload.company_name = validatedFields.data.company_name?.trim() || null
    }

    if (currentProfile.role === "supervisor") {
        updatePayload.supervised_company_name = validatedFields.data.supervised_company_name?.trim() || null
    }

    const { error } = await supabaseAdmin
        .from("users")
        .update(updatePayload)
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

export async function updatePassword(
    prevState: ProfileActionState,
    formData: FormData
): Promise<ProfileActionState> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autenticado" }
    }

    if (!user.email) {
        return { error: "Email do usuário não disponível para validação de senha." }
    }

    const currentPassword = (formData.get("currentPassword") as string) ?? ""
    const newPassword = (formData.get("newPassword") as string) ?? ""
    const confirmPassword = (formData.get("confirmPassword") as string) ?? ""

    const validatedFields = passwordSchema.safeParse({
        currentPassword,
        newPassword,
        confirmPassword,
    })

    if (!validatedFields.success) {
        const flattenedErrors = validatedFields.error.flatten().fieldErrors
        return {
            error: flattenedErrors.currentPassword?.[0] ||
                flattenedErrors.newPassword?.[0] ||
                flattenedErrors.confirmPassword?.[0] ||
                "Senha inválida",
        }
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
            return { error: "Configuração de autenticação ausente." }
        }

        const supabaseVerifier = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        })

        const { error: verifyError } = await supabaseVerifier.auth.signInWithPassword({
            email: user.email,
            password: validatedFields.data.currentPassword,
        })

        if (verifyError) {
            return { error: "Senha atual inválida." }
        }

        const { error: updateError } = await supabase.auth.updateUser({
            password: validatedFields.data.newPassword,
        })

        if (updateError) {
            console.error("Erro ao atualizar senha:", updateError)
            return { error: updateError.message || "Não foi possível alterar a senha." }
        }
    } catch (error: any) {
        console.error("Erro ao atualizar senha:", error)
        return { error: error?.message || "Não foi possível alterar a senha." }
    }

    return { success: "Senha alterada com sucesso!", error: undefined }
}
