import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function Login({
    searchParams,
}: {
    searchParams: Promise<{ message: string }>
}) {
    const { message } = await searchParams
    const signIn = async (formData: FormData) => {
        'use server'

        const email = formData.get('email') as string
        const password = formData.get('password') as string
        const supabase = await createClient()

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            console.error('Sign In Error:', error);
            return redirect(`/login?message=${encodeURIComponent(error.message)}`)
        }

        return redirect('/dashboard')
    }

    const signUp = async (formData: FormData) => {
        'use server'

        const origin = (await headers()).get('origin')
        const email = formData.get('email') as string
        const password = formData.get('password') as string
        const supabase = await createClient()

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${origin}/auth/callback`,
            },
        })

        if (error) {
            console.error('Sign Up Error:', error);
            return redirect(`/login?message=${encodeURIComponent(error.message)}`)
        }

        return redirect('/login?message=Check email for confirmation link')
    }

    return (
        <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 h-screen mx-auto">
            <form
                className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground"
                action={signIn}
            >
                <h1 className="text-2xl font-bold mb-4">InstaDM Appointment Setter</h1>

                <label className="text-md" htmlFor="email">
                    Email
                </label>
                <input
                    className="rounded-md px-4 py-2 bg-inherit border mb-6"
                    name="email"
                    placeholder="you@example.com"
                    required
                />
                <label className="text-md" htmlFor="password">
                    Password
                </label>
                <input
                    className="rounded-md px-4 py-2 bg-inherit border mb-6"
                    type="password"
                    name="password"
                    placeholder="••••••••"
                    required
                />
                <button className="bg-blue-600 rounded-md px-4 py-2 text-white mb-2">
                    Sign In
                </button>
                <button
                    formAction={signUp}
                    className="border border-foreground/20 rounded-md px-4 py-2 text-foreground mb-2"
                >
                    Sign Up
                </button>
                {message && (
                    <p className="mt-4 p-4 bg-foreground/10 text-center text-red-500 rounded-md">
                        {message}
                    </p>
                )}
            </form>
        </div>
    )
}
