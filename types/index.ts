// ─── Database Row Types ──────────────────────────────────────────

export interface AgentConfig {
    user_id: string
    prompt_data: Record<string, string>
    openai_key?: string
    manychat_key: string
    reply_mode: 'single_block' | 'conversational'
    google_refresh_token: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface FieldDefinition {
    key: string
    label: string
    type: 'text' | 'textarea' | 'file'
    default_value: string
    order: number
}

export interface WebhookLog {
    id: string
    user_id: string
    level: 'info' | 'error' | 'success'
    event: string
    details: Record<string, unknown>
    created_at: string
}

// ─── Webhook Payload Types ──────────────────────────────────────

export interface WebhookPayload {
    subscriber_id?: string | number
    sessionId?: string
    id?: string | number
    message?: string
    last_input_text?: string
    first_name?: string
    name?: string
    username?: string
}

export interface QStashWorkerBody {
    payload: WebhookPayload
}

// ─── ManyChat Types ─────────────────────────────────────────────

export interface ManyChatSubscriber {
    id: string
    first_name: string
    last_name: string
    name: string
    gender: string
    profile_pic: string
    locale: string
    language: string
    timezone: string
    live_chat_url: string
    last_interaction: string
    custom_fields: Record<string, string | number | boolean | null>
}

// ─── Google Calendar Types ──────────────────────────────────────

export interface CalendarBusySlot {
    start: string
    end: string
}

export interface CalendarEvent {
    id: string
    htmlLink: string
    summary: string
    start: { dateTime: string }
    end: { dateTime: string }
    description?: string
}

// ─── Platform Data (passed through worker) ──────────────────────

export interface PlatformData {
    first_name?: string
    username?: string
}

// ─── Component Props ────────────────────────────────────────────

export interface AgentFormConfig {
    prompt_data: Record<string, string>
    manychat_key: string
    reply_mode: 'single_block' | 'conversational'
    google_refresh_token: string | null
}
