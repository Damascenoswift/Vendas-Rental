import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canWorksDepartmentAccessPath, isWorksDepartment } from '@/lib/department-access'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Supabase environment variables are missing in middleware!")
        throw new Error("Supabase environment variables are missing in middleware!")
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (
        !user &&
        !request.nextUrl.pathname.startsWith('/api') &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/reset-password')
    ) {
        // no user, potentially respond by redirecting the user to the login page
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    if (user) {
        const pathname = request.nextUrl.pathname
        const metadataDepartment =
            typeof user.user_metadata?.department === "string"
                ? user.user_metadata.department
                : null

        let effectiveDepartment = metadataDepartment

        if (!effectiveDepartment) {
            const { data: profileRow } = await supabase
                .from("users")
                .select("department")
                .eq("id", user.id)
                .maybeSingle()

            if (profileRow && typeof (profileRow as { department?: unknown }).department === "string") {
                effectiveDepartment = (profileRow as { department: string }).department
            }
        }

        if (isWorksDepartment(effectiveDepartment) && !canWorksDepartmentAccessPath(pathname)) {
            const url = request.nextUrl.clone()
            url.pathname = "/admin/obras"
            url.search = ""
            return NextResponse.redirect(url)
        }
    }

    return supabaseResponse
}
