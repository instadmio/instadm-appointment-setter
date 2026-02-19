import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AgentForm from '@/components/AgentForm'

export default async function Dashboard() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return redirect('/login')
    }

    // 1. Fetch Field Definitions
    // In a real app, we fetch from DB. For now, we use the ones defined in schema.sql
    // const { data: fields } = await supabase.from('field_definitions').select('*').order('order');

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
        <>
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                        Welcome, {user.email}
                    </h2>
                </div>
            </div>

            <AgentForm
                initialConfig={config}
                fields={mutableFields}
                userId={user.id}
            />
        </>
    )
}
