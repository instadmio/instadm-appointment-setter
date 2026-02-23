'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Save, Loader2, Upload } from 'lucide-react'

interface FieldDefinition {
    key: string
    label: string
    type: 'text' | 'textarea' | 'file'
    default_value: string
}

interface AgentFormProps {
    initialConfig: any
    fields: FieldDefinition[]
    userId: string
}

export default function AgentForm({ initialConfig, fields, userId }: AgentFormProps) {
    const [loading, setLoading] = useState(false)
    const [config, setConfig] = useState(initialConfig.prompt_data || {})
    const [keys, setKeys] = useState({
        openai: initialConfig.openai_key || '',
        manychat: initialConfig.manychat_key || '',
    })
    const [replyMode, setReplyMode] = useState(initialConfig.reply_mode || 'single_block')
    const [webhookUrl, setWebhookUrl] = useState('')

    useEffect(() => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        const baseUrl = appUrl || window.location.origin
        setWebhookUrl(`${baseUrl}/api/webhook/${userId}`)
    }, [userId])

    const supabase = createClient()

    const handleSave = async () => {
        setLoading(true)
        try {
            // Save to DB
            const { error } = await supabase
                .from('agent_configs')
                .upsert({
                    user_id: userId,
                    prompt_data: config,
                    openai_key: keys.openai,
                    manychat_key: keys.manychat,
                    reply_mode: replyMode,
                    updated_at: new Date().toISOString()
                })

            if (error) throw error
            alert('Configuration Saved Successfully!')
        } catch (e: any) {
            console.error(e)
            alert('Error saving: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Agent Configuration</h3>
                <div className="mt-2 text-sm text-gray-500">
                    <p>Configure your AI Appointment Setter.</p>
                </div>

                <div className="mt-6 space-y-6">

                    {/* API Keys Section */}
                    <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6 border-b pb-6">
                        {/* OpenAI Key Hidden - Using Global Key */}
                        {/* <div className="sm:col-span-3">
                            <label className="block text-sm font-medium text-gray-700">OpenAI API Key</label>
                            <input
                                type="password"
                                value={keys.openai}
                                onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                            />
                        </div> */}
                        <div className="sm:col-span-3">
                            <label className="block text-sm font-medium text-gray-700">ManyChat API Key</label>
                            <input
                                type="password"
                                value={keys.manychat}
                                onChange={(e) => setKeys({ ...keys, manychat: e.target.value })}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                            />
                        </div>
                    </div>

                    {/* Reply Mode Toggle */}
                    <div className="border-b pb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">AI Reply Mode</label>
                        <div className="flex items-center space-x-4">
                            <button
                                type="button"
                                onClick={() => setReplyMode('single_block')}
                                className={`px-4 py-2 border rounded-md text-sm font-medium transition-colors ${replyMode === 'single_block' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                                Single Block (Standard)
                            </button>
                            <button
                                type="button"
                                onClick={() => setReplyMode('conversational')}
                                className={`px-4 py-2 border rounded-md text-sm font-medium transition-colors ${replyMode === 'conversational' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
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
                    <div className="border-b pb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Google Calendar Integration</label>
                        <div className="flex items-center space-x-4">
                            {initialConfig.google_refresh_token ? (
                                <button
                                    type="button"
                                    onClick={() => alert('Calendar already connected. To disconnect, revoke access in your Google Account security settings.')}
                                    className="px-4 py-2 border border-green-500 rounded-md text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                                >
                                    ✓ Google Calendar Connected
                                </button>
                            ) : (
                                <a
                                    href={`/api/auth/google/login?userId=${userId}`}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium bg-white text-gray-700 hover:bg-gray-50 transition-colors"
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
                        <div key={field.key} className={field.key === 'custom_instructions' ? "p-5 bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm" : ""}>
                            <label className={`block text-sm font-medium mb-1 ${field.key === 'custom_instructions' ? 'text-indigo-900 font-bold text-base' : 'text-gray-700'}`}>
                                {field.label}
                            </label>
                            {field.key === 'custom_instructions' && (
                                <p className="text-xs text-indigo-600 mb-3">This heavily dictates how your agent behaves and responds to the customer. Be specific.</p>
                            )}
                            {field.type === 'textarea' ? (
                                <textarea
                                    rows={field.key === 'custom_instructions' ? 8 : 4}
                                    value={config[field.key] || ''}
                                    onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                    placeholder={field.key === 'custom_instructions' ? "Example: You are a friendly booking assistant for an online fitness coach. Only use emojis occasionally..." : ""}
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={config[field.key] || ''}
                                    onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                />
                            )}
                        </div>
                    ))}

                    <div className="pt-5 flex justify-end">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={loading}
                            className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save className="mr-2" size={16} />}
                            Save Configuration
                        </button>
                    </div>
                </div>
            </div>

            {/* Webhook URL Display */}
            <div className="px-4 py-4 sm:px-6 bg-gray-50 rounded-b-lg border-t">
                <h4 className="text-sm font-medium text-gray-900">Your Webhook URL</h4>
                <div className="mt-2 flex rounded-md shadow-sm">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                        POST
                    </span>
                    <input
                        type="text"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-gray-300 text-gray-900"
                    />
                </div>
                <p className="mt-1 text-xs text-gray-500">Paste this URL into your ManyChat "Data Request" action.</p>
            </div>
        </div>
    )
}
