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
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [resetInfo, setResetInfo] = useState<string | null>(null)

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

  const handleForgotPassword = async () => {
    setResetInfo(null)
    setAuthError(null)
    const email = form.getValues("email").trim()
    if (!email) {
      setAuthError("Informe seu email no campo acima e clique em 'Esqueci minha senha'.")
      return
    }
    setIsSendingReset(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setIsSendingReset(false)
    if (error) {
      setAuthError(
        error.message === "For security purposes, you can only request this after 60 seconds."
          ? "Aguarde 60 segundos antes de solicitar outro email."
          : "Não foi possível enviar o email de redefinição."
      )
      return
    }
    setResetInfo("Enviamos um email com o link para redefinir sua senha. Verifique sua caixa de entrada e spam.")
  }

  if (isCheckingSession) {
    return (
      <div className="app-shell-gradient flex min-h-screen items-center justify-center">
        <span className="glass-surface rounded-full border px-4 py-2 text-sm text-muted-foreground">
          Carregando…
        </span>
      </div>
    )
  }

  return (
    <div className="app-shell-gradient relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/70 bg-background/85 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.7)] backdrop-blur-sm">
        <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
          <aside className="relative hidden min-h-[520px] overflow-hidden border-r border-border/60 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(45,212,191,0.24),transparent_46%),radial-gradient(circle_at_88%_12%,rgba(56,189,248,0.22),transparent_40%)]" />
            <div className="relative space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-teal-100/80">
                Rental Energia
              </p>
              <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
                Plataforma comercial com ritmo de operação profissional.
              </h2>
              <p className="max-w-md text-sm text-slate-200/80">
                Acompanhe indicadores, fluxo de indicações e execução das equipes em um único painel.
              </p>
            </div>
            <div className="relative rounded-2xl border border-white/15 bg-white/8 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-teal-100/80">Ambiente seguro</p>
              <p className="mt-2 text-sm text-slate-200/85">
                Acesso restrito com autenticação corporativa e rastreamento de atividade.
              </p>
            </div>
          </aside>

          <div className="p-6 sm:p-8 lg:p-10">
            <div className="mb-7 space-y-1.5">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Acesse sua conta
              </h1>
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
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {authError}
                  </div>
                ) : null}

                {resetInfo ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                    {resetInfo}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <Button className="w-full sm:w-[52%]" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Entrando…" : "Entrar"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-sm text-foreground/75 hover:text-foreground"
                    onClick={handleForgotPassword}
                    disabled={isSendingReset}
                  >
                    {isSendingReset ? "Enviando…" : "Esqueci minha senha"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  )
}
