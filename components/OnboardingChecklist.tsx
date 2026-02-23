'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'
import type { AgentFormConfig } from '@/types'

interface OnboardingChecklistProps {
    config: AgentFormConfig
    userId: string
}

interface Step {
    label: string
    done: boolean
    hint: string
}

export default function OnboardingChecklist({ config, userId }: OnboardingChecklistProps) {
    const steps: Step[] = [
        {
            label: 'Add your ManyChat API key',
            done: !!config.manychat_key,
            hint: 'Found in ManyChat Settings > API. Paste it in the field below.',
        },
        {
            label: 'Write your System Prompt',
            done: !!(config.prompt_data?.custom_instructions),
            hint: 'Tell the AI how to behave — its personality, tone, and what it should do.',
        },
        {
            label: 'Connect Google Calendar',
            done: !!config.google_refresh_token,
            hint: 'Let the AI check your availability and book calls directly.',
        },
        {
            label: 'Copy your Webhook URL into ManyChat',
            done: false, // We can't detect this — it's external
            hint: 'Use the webhook URL at the bottom of the form in a ManyChat "External Request" action.',
        },
    ]

    const completedCount = steps.filter(s => s.done).length
    const allDone = completedCount === steps.length

    const [dismissed, setDismissed] = useState(false)
    const [collapsed, setCollapsed] = useState(false)

    if (dismissed || allDone) return null

    return (
        <div className="mb-8 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                        Getting Started
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {completedCount} of {steps.length} steps complete
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                    >
                        Dismiss
                    </button>
                    {collapsed ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
                </div>
            </button>

            {!collapsed && (
                <div className="px-5 pb-4 space-y-3">
                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                            className="ig-gradient h-1.5 rounded-full transition-all"
                            style={{ width: `${(completedCount / steps.length) * 100}%` }}
                        />
                    </div>

                    {steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                            {step.done ? (
                                <CheckCircle2 size={18} className="text-green-500 mt-0.5 shrink-0" />
                            ) : (
                                <Circle size={18} className="text-gray-300 mt-0.5 shrink-0" />
                            )}
                            <div>
                                <p className={`text-sm ${step.done ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>
                                    {step.label}
                                </p>
                                {!step.done && (
                                    <p className="text-xs text-gray-500 mt-0.5">{step.hint}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
