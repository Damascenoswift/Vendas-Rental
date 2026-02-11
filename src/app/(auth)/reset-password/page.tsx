"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const schema = z
  .object({
    password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    confirmPassword: z.string().min(6, "Confirme sua senha"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  })

type FormValues = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      const sessionExists = Boolean(data.session)
      setHasSession(sessionExists)
      if (!sessionExists) {
        setInfo("Link inválido ou expirado. Solicite uma nova redefinição em \"Esqueci minha senha\" na tela de login.")
      }
      setIsReady(true)
    }

    void initialize()
    return () => {
      isMounted = false
    }
  }, [])

  const onSubmit = async (values: FormValues) => {
    if (!hasSession) {
      setError("Sessão de redefinição inválida. Solicite um novo link no login.")
      return
    }

    setError(null)
    setInfo(null)
    const { error: updateError } = await supabase.auth.updateUser({
      password: values.password,
    })
    if (updateError) {
      setError("Não foi possível atualizar a senha. Tente novamente.")
      return
    }
    setInfo("Senha redefinida com sucesso. Você já pode acessar o sistema.")
    setTimeout(() => {
      router.replace("/login")
      router.refresh()
    }, 1200)
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Preparando…</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold">Redefinir senha</h1>
        {hasSession ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
              ) : null}
              {info ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{info}</div>
              ) : null}

              <Button type="submit" className="w-full">Atualizar senha</Button>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            {info ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                {info}
              </div>
            ) : null}
            <Button type="button" className="w-full" onClick={() => router.replace("/login")}>
              Voltar para o login
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
