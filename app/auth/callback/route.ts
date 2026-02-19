import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    // The `/auth/callback` route is required for the server-side auth flow implemented
    // by the SSR package. It exchanges an auth code for the user's session.
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const origin = requestUrl.origin

    const error = requestUrl.searchParams.get('error')
    const error_description = requestUrl.searchParams.get('error_description')

    if (error) {
        console.error('Auth Callback Error:', error, error_description)
        return NextResponse.redirect(`${origin}/login?message=${error_description || 'Authentication failed'}`)
    }

    if (code) {
        const supabase = await createClient()
        const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
        if (sessionError) {
            console.error('Exchange Code Error:', sessionError)
            return NextResponse.redirect(`${origin}/login?message=Session exchange failed`)
        }
    }

    // URL to redirect to after sign in process completes
    return NextResponse.redirect(`${origin}/dashboard`)
}
