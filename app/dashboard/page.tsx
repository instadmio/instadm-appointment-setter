import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import AgentForm from '@/components/AgentForm'
import LogsTable from '@/components/LogsTable'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return redirect('/login')
    }

    // 1. Fetch Field Definitions
    const fields = [
        { key: 'agent_name', label: 'Agent Name', type: 'text', default_value: 'AI Assistant', order: 10 },
        { key: 'agent_backstory', label: 'Agent Persona / Backstory', type: 'textarea', default_value: '', order: 20 },
        { key: 'business_description', label: 'Business Description & Offer', type: 'textarea', default_value: '', order: 30 },
        { key: 'knowledge_base', label: 'Knowledge Base (FAQ)', type: 'textarea', default_value: '', order: 40 },
    ] as const;

    // 2. Fetch User Config
    let config = {
        prompt_data: {},
        openai_key: '',
        manychat_key: ''
    };

    try {
        const { data } = await supabase
            .from('agent_configs')
            .select('*')
            .eq('user_id', user.id)
            .single()

        if (data) {
            config = data;
        }
    } catch (e) {
        console.log('Error fetching config (expected if table missing)', e)
    }

    // Cast fields to mutable array to satisfy AgentForm props
    const mutableFields: any[] = [...fields];

    return (
        <div className="max-w-4xl mx-auto">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                        Welcome, {user.email}
                    </h2>
                    <p className="mt-2 text-sm text-gray-500">
                        <strong>Your Webhook URL:</strong>{' '}
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">
                            {process.env.NEXT_PUBLIC_APP_URL || 'https://instadm-appointment-setter.vercel.app'}/api/webhook/{user.id}
                        </code>
                    </p>
                </div>
            </div>

            <AgentForm
                initialConfig={config}
                fields={mutableFields}
                userId={user.id}
            />

            <div className="mt-12 pt-8 border-t border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-medium leading-6 text-gray-900">
                        Webhook Activity Logs
                    </h3>
                    <form action={async () => {
                        'use server';
                        revalidatePath('/dashboard');
                    }}>
                        <button type="submit" className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">
                            Refresh Logs ↻
                        </button>
                    </form>
                </div>
                {/* @ts-ignore */}
                <LogsTable userId={user.id} />
            </div>
        </div>
    )
}
