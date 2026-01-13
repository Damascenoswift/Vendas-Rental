"use client"

import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import { buildUserProfile, getProfile, type UserProfile } from "@/lib/auth"

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

      if (currentSession?.user) {
        const dbProfile = await getProfile(supabase, currentSession.user.id)
        setProfile(dbProfile || buildUserProfile(currentSession.user))
      } else {
        setProfile(null)
      }

      setStatus(currentSession ? "authenticated" : "unauthenticated")
    }

    void resolveSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return

      setSession(newSession)

      if (newSession?.user) {
        const dbProfile = await getProfile(supabase, newSession.user.id)
        setProfile(dbProfile || buildUserProfile(newSession.user))
      } else {
        setProfile(null)
      }

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
