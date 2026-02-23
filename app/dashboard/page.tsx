import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import AgentForm from '@/components/AgentForm'
import LogsTable from '@/components/LogsTable'
import OnboardingChecklist from '@/components/OnboardingChecklist'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { AgentFormConfig, FieldDefinition } from '@/types'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return redirect('/login')
    }

    // 1. Field Definitions
    const fields: FieldDefinition[] = [
        { key: 'custom_instructions', label: 'Master System Prompt (Core Behavior)', type: 'textarea', default_value: '', order: 10 },
        { key: 'agent_name', label: 'Agent Name', type: 'text', default_value: 'AI Assistant', order: 20 },
        { key: 'agent_backstory', label: 'Agent Persona / Backstory', type: 'textarea', default_value: '', order: 30 },
        { key: 'business_description', label: 'Business Description & Offer', type: 'textarea', default_value: '', order: 40 },
        { key: 'knowledge_base', label: 'Knowledge Base (FAQ)', type: 'textarea', default_value: '', order: 50 },
    ];

    // 2. Fetch User Config
    let config: AgentFormConfig = {
        prompt_data: {},
        manychat_key: '',
        reply_mode: 'single_block',
        google_refresh_token: null,
    };

    try {
        const { data } = await supabase
            .from('agent_configs')
            .select('prompt_data, manychat_key, reply_mode, google_refresh_token')
            .eq('user_id', user.id)
            .single()

        if (data) {
            config = {
                prompt_data: data.prompt_data || {},
                manychat_key: data.manychat_key || '',
                reply_mode: data.reply_mode || 'single_block',
                google_refresh_token: data.google_refresh_token,
            };
        }
    } catch (e) {
        console.log('Error fetching config (expected if table missing)', e)
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                        Welcome, {user.email}
                    </h2>
                </div>
            </div>

            <OnboardingChecklist config={config} userId={user.id} />

            <ErrorBoundary>
                <AgentForm
                    initialConfig={config}
                    fields={fields}
                    userId={user.id}
                />
            </ErrorBoundary>

            <div className="mt-12 pt-8 border-t border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold leading-6 text-gray-900">
                        Webhook Activity Logs
                    </h3>
                    <form action={async () => {
                        'use server';
                        revalidatePath('/dashboard');
                    }}>
                        <button type="submit" className="text-gray-500 hover:text-black text-sm font-medium transition-colors">
                            Refresh Logs
                        </button>
                    </form>
                </div>
                <ErrorBoundary>
                    <LogsTable userId={user.id} />
                </ErrorBoundary>
            </div>
        </div>
    )
}
