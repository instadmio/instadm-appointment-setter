'use client'

import { useState, useEffect } from 'react'
import type { WebhookLog } from '@/types'

const COMMON_TIMEZONES = [
    { label: 'Hawaii (HST)', value: 'Pacific/Honolulu' },
    { label: 'Alaska (AKST)', value: 'America/Anchorage' },
    { label: 'Pacific (PST)', value: 'America/Los_Angeles' },
    { label: 'Mountain (MST)', value: 'America/Denver' },
    { label: 'Central (CST)', value: 'America/Chicago' },
    { label: 'Eastern (EST)', value: 'America/New_York' },
    { label: 'Atlantic (AST)', value: 'America/Halifax' },
    { label: 'London (GMT)', value: 'Europe/London' },
    { label: 'Paris (CET)', value: 'Europe/Paris' },
    { label: 'Dubai (GST)', value: 'Asia/Dubai' },
    { label: 'India (IST)', value: 'Asia/Kolkata' },
    { label: 'Singapore (SGT)', value: 'Asia/Singapore' },
    { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
    { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
    { label: 'Auckland (NZST)', value: 'Pacific/Auckland' },
]

const STORAGE_KEY = 'instadm-timezone'

function detectTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
        return 'UTC'
    }
}

function formatLogTime(isoString: string, timezone: string): string {
    return new Date(isoString).toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    })
}

export default function LogsTableClient({ logs }: { logs: WebhookLog[] }) {
    const [timezone, setTimezone] = useState<string>('UTC')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY)
        setTimezone(saved || detectTimezone())
        setMounted(true)
    }, [])

    const handleTimezoneChange = (tz: string) => {
        setTimezone(tz)
        localStorage.setItem(STORAGE_KEY, tz)
    }

    // Find whether the detected/saved timezone is in our common list
    const isCustom = mounted && !COMMON_TIMEZONES.some(t => t.value === timezone)

    return (
        <div className="flex flex-col">
            <div className="flex justify-end mb-3">
                <select
                    value={timezone}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-black"
                >
                    {isCustom && (
                        <option value={timezone}>{timezone}</option>
                    )}
                    {COMMON_TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                </select>
            </div>
            <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                    <div className="shadow-sm overflow-hidden border border-gray-200 rounded-2xl">
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
                                            {mounted ? formatLogTime(log.created_at, timezone) : '—'}
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
