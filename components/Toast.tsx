'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastMessage {
    id: number
    type: ToastType
    text: string
}

let toastId = 0

export function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([])

    const addToast = useCallback((type: ToastType, text: string) => {
        const id = ++toastId
        setToasts(prev => [...prev, { id, type, text }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 4000)
    }, [])

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return { toasts, addToast, removeToast }
}

const typeStyles: Record<ToastType, string> = {
    success: 'bg-green-50 border-green-400 text-green-800',
    error: 'bg-red-50 border-red-400 text-red-800',
    info: 'bg-blue-50 border-blue-400 text-blue-800',
}

export function ToastContainer({ toasts, removeToast }: { toasts: ToastMessage[], removeToast: (id: number) => void }) {
    if (toasts.length === 0) return null

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border shadow-sm text-sm font-medium animate-in ${typeStyles[toast.type]}`}
                >
                    <span>{toast.text}</span>
                    <button onClick={() => removeToast(toast.id)} className="ml-2 opacity-60 hover:opacity-100">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    )
}
