'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Save, Loader2 } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/Toast'
import type { AgentFormConfig, FieldDefinition } from '@/types'

interface AgentFormProps {
    initialConfig: AgentFormConfig
    fields: FieldDefinition[]
    userId: string
}

export default function AgentForm({ initialConfig, fields, userId }: AgentFormProps) {
    const [loading, setLoading] = useState(false)
    const [config, setConfig] = useState<Record<string, string>>(initialConfig.prompt_data || {})
    const [manychatKey, setManychatKey] = useState(initialConfig.manychat_key || '')
    const [replyMode, setReplyMode] = useState(initialConfig.reply_mode || 'single_block')
    const [calendarConnected, setCalendarConnected] = useState(!!initialConfig.google_refresh_token)
    const [webhookUrl, setWebhookUrl] = useState('')
    const router = useRouter()
    const { toasts, addToast, removeToast } = useToast()

    useEffect(() => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        const baseUrl = appUrl || window.location.origin
        setWebhookUrl(`${baseUrl}/api/webhook/${userId}`)
    }, [userId])

    const supabase = createClient()

    const handleSave = async () => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('agent_configs')
                .upsert({
                    user_id: userId,
                    prompt_data: config,
                    manychat_key: manychatKey,
                    reply_mode: replyMode,
                    updated_at: new Date().toISOString()
                })

            if (error) throw error
            addToast('success', 'Configuration saved successfully!')
            router.refresh()
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : 'Unknown error'
            console.error(e)
            addToast('error', 'Error saving: ' + errMsg)
        } finally {
            setLoading(false)
        }
    }

    const handleDisconnectCalendar = async () => {
        try {
            const { error } = await supabase
                .from('agent_configs')
                .update({ google_refresh_token: null })
                .eq('user_id', userId)

            if (error) throw error
            setCalendarConnected(false)
            addToast('info', 'Google Calendar disconnected. Reload the page to reconnect.')
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : 'Unknown error'
            addToast('error', 'Failed to disconnect: ' + errMsg)
        }
    }

    return (
        <>
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="bg-white shadow-sm border border-gray-200 rounded-2xl">
                <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-semibold text-gray-900">Agent Configuration</h3>
                    <div className="mt-2 text-sm text-gray-500">
                        <p>Configure your AI Appointment Setter.</p>
                    </div>

                    <div className="mt-6 space-y-6">

                        {/* ManyChat API Key */}
                        <div className="border-b border-gray-100 pb-6">
                            <label className="block text-sm font-medium text-gray-700">ManyChat API Key</label>
                            <input
                                type="password"
                                value={manychatKey}
                                onChange={(e) => setManychatKey(e.target.value)}
                                className="mt-1 block w-full sm:max-w-md border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-black focus:border-black sm:text-sm text-gray-900"
                                placeholder="Paste your ManyChat API key"
                            />
                            <p className="mt-1 text-xs text-gray-500">Found in ManyChat Settings &gt; API.</p>
                        </div>

                        {/* Reply Mode Toggle */}
                        <div className="border-b border-gray-100 pb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">AI Reply Mode</label>
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setReplyMode('single_block')}
                                    className={`px-4 py-2 border rounded-xl text-sm font-medium transition-all ${replyMode === 'single_block' ? 'bg-black border-black text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-black'}`}
                                >
                                    Single Block (Standard)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setReplyMode('conversational')}
                                    className={`px-4 py-2 border rounded-xl text-sm font-medium transition-all ${replyMode === 'conversational' ? 'bg-black border-black text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-black'}`}
                                >
                                    Conversational (Multi-message)
                                </button>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                {replyMode === 'single_block'
                                    ? 'The AI will send its entire response in one contiguous message.'
                                    : 'The AI will intelligently break up its response into multiple natural, shorter messages with typing delays.'}
                            </p>
                        </div>

                        {/* Google Calendar Connection */}
                        <div className="border-b border-gray-100 pb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Google Calendar Integration</label>
                            <div className="flex items-center space-x-3">
                                {calendarConnected ? (
                                    <>
                                        <span className="inline-flex items-center px-3 py-2 border border-green-500 rounded-xl text-sm font-medium bg-green-50 text-green-700">
                                            Google Calendar Connected
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleDisconnectCalendar}
                                            className="px-3 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-black hover:text-black transition-colors"
                                        >
                                            Disconnect
                                        </button>
                                    </>
                                ) : (
                                    <a
                                        href={`/api/auth/google/login?userId=${userId}`}
                                        className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium bg-white text-gray-700 hover:border-black hover:text-black transition-colors"
                                    >
                                        Connect Google Calendar
                                    </a>
                                )}
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                Allow the AI to check your availability and book appointments directly on your calendar.
                            </p>
                        </div>

                        {/* Dynamic Fields */}
                        {fields.map((field) => (
                            <div key={field.key} className={field.key === 'custom_instructions' ? "p-5 bg-gray-50 border border-gray-200 rounded-2xl" : ""}>
                                <label className={`block text-sm font-medium mb-1 ${field.key === 'custom_instructions' ? 'text-gray-900 font-semibold text-base' : 'text-gray-700'}`}>
                                    {field.label}
                                </label>
                                {field.key === 'custom_instructions' && (
                                    <p className="text-xs text-gray-500 mb-3">This heavily dictates how your agent behaves and responds to the customer. Be specific.</p>
                                )}
                                {field.type === 'textarea' ? (
                                    <textarea
                                        rows={field.key === 'custom_instructions' ? 8 : 4}
                                        value={config[field.key] || ''}
                                        onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                                        className="mt-1 block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-black focus:border-black sm:text-sm text-gray-900"
                                        placeholder={field.key === 'custom_instructions' ? "Example: You are a friendly booking assistant for an online fitness coach. Only use emojis occasionally..." : ""}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={config[field.key] || ''}
                                        onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                                        className="mt-1 block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-3 focus:outline-none focus:ring-1 focus:ring-black focus:border-black sm:text-sm text-gray-900"
                                    />
                                )}
                            </div>
                        ))}

                        <div className="pt-5 flex justify-end">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={loading}
                                className="ml-3 inline-flex justify-center py-2.5 px-5 rounded-xl text-sm font-medium text-white bg-black hover:bg-gray-800 transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save className="mr-2" size={16} />}
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>

                {/* Webhook URL Display */}
                <div className="px-4 py-4 sm:px-6 bg-gray-50 rounded-b-2xl border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-900">Your Webhook URL</h4>
                    <div className="mt-2 flex rounded-xl shadow-sm">
                        <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm font-mono">
                            POST
                        </span>
                        <input
                            type="text"
                            readOnly
                            value={webhookUrl}
                            className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-xl sm:text-sm border border-gray-300 text-gray-900 bg-white font-mono"
                        />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Paste this URL into your ManyChat &quot;External Request&quot; action.</p>
                </div>
            </div>
        </>
    )
}
