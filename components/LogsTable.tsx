import { createClient } from '@/utils/supabase/server'
import type { WebhookLog } from '@/types'
import LogsTableClient from './LogsTableClient'

export default async function LogsTable({ userId }: { userId: string }) {
    const supabase = await createClient()

    let logs: WebhookLog[] = [];
    let error: string | null = null;

    try {
        const { data, error: dbError } = await supabase
            .from('webhook_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (dbError) throw dbError;
        logs = (data || []) as WebhookLog[];
    } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        console.error('Error fetching logs:', errMsg);
        error = errMsg;
    }

    if (error) {
        return (
            <div className="rounded-md bg-yellow-50 p-4">
                <div className="flex">
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Logs not available</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                            <p>Please run the database migration to create the webhook_logs table.</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (!logs || logs.length === 0) {
        return <div className="text-gray-500 italic text-sm">No activity logs found yet. Send a message to test!</div>
    }

    return <LogsTableClient logs={logs} />
}
