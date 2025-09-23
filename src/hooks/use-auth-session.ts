"use client"

import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import { buildUserProfile, type UserProfile } from "@/lib/auth"

type AuthStatus = "loading" | "authenticated" | "unauthenticated"

type UseAuthSessionReturn = {
  session: Session | null
  status: AuthStatus
  profile: UserProfile | null
}

export function useAuthSession(): UseAuthSessionReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    let isMounted = true

    const resolveSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!isMounted) return

      const currentSession = data.session ?? null
      setSession(currentSession)
      setProfile(buildUserProfile(currentSession?.user ?? null))
      setStatus(currentSession ? "authenticated" : "unauthenticated")
    }

    void resolveSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return

      setSession(newSession)
      setProfile(buildUserProfile(newSession?.user ?? null))
      setStatus(newSession ? "authenticated" : "unauthenticated")
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return {
    session,
    status,
    profile,
  }
}
