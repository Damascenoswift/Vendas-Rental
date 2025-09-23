"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

const loginSchema = z.object({
  email: z
    .string({
      message: "Email é obrigatório",
    })
    .email("Informe um email válido"),
  password: z
    .string({
      message: "Senha é obrigatória",
    })
    .min(6, "Senha deve ter pelo menos 6 caracteres"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  useEffect(() => {
    let isMounted = true

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!isMounted) return

      if (data.session) {
        router.replace("/dashboard")
      }

      setIsCheckingSession(false)
    }

    checkSession()

    return () => {
      isMounted = false
    }
  }, [router])

  const handleSubmit = async (values: LoginFormValues) => {
    setAuthError(null)
    setIsSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      setAuthError(
        error.message === "Invalid login credentials"
          ? "Credenciais inválidas. Verifique email e senha."
          : "Não foi possível fazer login. Tente novamente."
      )
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    router.replace("/dashboard")
    router.refresh()
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Carregando…</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Acesse sua conta</h1>
          <p className="text-sm text-muted-foreground">
            Use seu email corporativo para entrar no painel Rental.
          </p>
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="email"
                      inputMode="email"
                      placeholder="exemplo@empresa.com"
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      type="password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {authError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {authError}
              </div>
            ) : null}

            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
