import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
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

        const email = formData.get('email') as string
        const password = formData.get('password') as string

        // Use admin API to bypass GoTrue's strict email validation on multi-part TLDs (.co.nz, .com.au, etc.)
        const admin = createServiceClient()
        const { error: createError } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })

        if (createError) {
            console.error('Sign Up Error:', createError)
            return redirect(`/login?message=${encodeURIComponent(createError.message)}`)
        }

        // Auto sign-in after account creation
        const supabase = await createClient()
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (signInError) {
            console.error('Auto Sign-In Error:', signInError)
            return redirect(`/login?message=Account created! Please sign in.`)
        }

        return redirect('/dashboard')
    }

    return (
        <div className="min-h-screen bg-white flex flex-col justify-center">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold ig-gradient-text">InstaDM</h1>
                    <p className="mt-2 text-sm text-gray-500">
                        AI Appointment Setter
                    </p>
                </div>

                <div className="bg-white py-8 px-6 shadow-sm rounded-2xl border border-gray-100 sm:px-10">
                    <form className="space-y-5" action={signIn}>
                        <div>
                            <label className="block text-sm font-medium text-gray-700" htmlFor="email">
                                Email
                            </label>
                            <input
                                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black sm:text-sm"
                                name="email"
                                type="email"
                                placeholder="you@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700" htmlFor="password">
                                Password
                            </label>
                            <input
                                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black sm:text-sm"
                                type="password"
                                name="password"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <button className="w-full flex justify-center py-2.5 px-4 rounded-xl text-sm font-medium text-white bg-black hover:bg-gray-800 transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black">
                            Sign In
                        </button>
                        <button
                            formAction={signUp}
                            className="w-full flex justify-center py-2.5 px-4 border border-black rounded-xl text-sm font-medium text-black bg-white hover:bg-black hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
                        >
                            Create Account
                        </button>
                        {message && (
                            <p className="mt-2 p-3 bg-red-50 text-center text-sm text-red-600 rounded-xl">
                                {message}
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </div>
    )
}
