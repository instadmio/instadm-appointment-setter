import { createClient } from '@/utils/supabase/server'

export default async function LogsTable({ userId }: { userId: string }) {
    const supabase = await createClient()

    let logs: any[] = [];
    let error = null;

    try {
        const { data, error: dbError } = await supabase
            .from('webhook_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (dbError) throw dbError;
        logs = data || [];
    } catch (e: any) {
        // If table doesn't exist yet, we don't want to crash the dashboard
        console.error('Error fetching logs:', e);
        error = e.message;
    }

    if (error) {
        return (
            <div className="rounded-md bg-yellow-50 p-4">
                <div className="flex">
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Logs not available</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                            <p>Please run the database migration to create the 'webhook_logs' table.</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (!logs || logs.length === 0) {
        return <div className="text-gray-500 italic text-sm">No activity logs found yet. Send a message to test!</div>
    }

    return (
        <div className="flex flex-col">
            <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                    <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Time
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Event
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Details
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(log.created_at).toLocaleTimeString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                                ${log.level === 'error' ? 'bg-red-100 text-red-800' :
                                                    log.level === 'success' ? 'bg-green-100 text-green-800' :
                                                        'bg-blue-100 text-blue-800'}`}>
                                                {log.level?.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                            {log.event}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate font-mono">
                                            {JSON.stringify(log.details)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
