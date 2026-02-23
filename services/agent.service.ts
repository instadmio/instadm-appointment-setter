import OpenAI from 'openai';
import { ZepClient } from '@getzep/zep-cloud';
import { CalendarService } from './calendar.service';
import type { AgentConfig, PlatformData } from '@/types';

const MAX_TOOL_ITERATIONS = 5;

export class AgentService {
    private openai: OpenAI;
    private zep: ZepClient;
    private config: AgentConfig;

    constructor(config: AgentConfig) {
        this.config = config;
        // Platform covers all OpenAI + Zep costs — always use global keys
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
        this.zep = new ZepClient({
            apiKey: process.env.ZEP_API_KEY!,
        });
    }

    async processMessage(userId: string, sessionId: string, message: string, platformData: PlatformData): Promise<string[]> {
        // 1. Check Zep User/Thread
        await this.ensureZepSession(sessionId, platformData);

        // 2. Fetch History
        let history: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        try {
            const thread = await this.zep.thread.get(sessionId);
            const threadMessages = thread.messages || [];
            history = threadMessages.map((m: { role?: string; roleType?: string; content: string }) => ({
                role: (m.role ?? m.roleType) as 'user' | 'assistant',
                content: m.content,
            }));
        } catch (e) {
            console.log(`Thread ${sessionId} not found or empty. Attempting creation...`);
            try {
                await this.zep.thread.create({ threadId: sessionId, userId: sessionId });
                console.log(`Thread ${sessionId} created successfully.`);
            } catch (createErr) {
                console.error(`Failed to create thread ${sessionId}:`, createErr);
            }
        }

        // 3. Construct Prompt
        const systemPrompt = this.buildSystemPrompt(this.config.prompt_data, this.config.reply_mode, !!this.config.google_refresh_token);

        // 4. Generate Response with Tool Calling Loop
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message },
        ];

        let response = await this.openai.chat.completions.create({
            model: 'gpt-4',
            messages,
            tools: this.config.google_refresh_token ? this.getCalendarTools() : undefined,
        });

        let responseMessage = response.choices[0].message;
        let iterations = 0;

        while (responseMessage.tool_calls && iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            messages.push(responseMessage);

            const calendarService = new CalendarService(this.config.google_refresh_token as string);

            for (const toolCall of responseMessage.tool_calls) {
                if (toolCall.type !== 'function') continue;
                const functionCall = toolCall.function;
                const args = JSON.parse(functionCall.arguments);
                let toolResult = '';

                try {
                    if (functionCall.name === 'check_calendar_availability') {
                        const busySlots = await calendarService.checkAvailability(args.timeMin, args.timeMax);
                        toolResult = this.formatAvailabilityResult(busySlots, args.timeMin, args.timeMax);
                    } else if (functionCall.name === 'book_appointment') {
                        const booking = await calendarService.createBooking(args.summary, args.startTime, args.endTime, args.description);
                        const readableTime = new Date(args.startTime).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
                        toolResult = `Booking confirmed! The appointment "${booking.summary}" has been added to the calendar for ${readableTime}. Do NOT share any links — just confirm the booking to the prospect in a friendly way.`;
                    } else if (functionCall.name === 'find_booking') {
                        const event = await calendarService.findEventByQuery(args.query);
                        if (event) {
                            const start = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown time';
                            toolResult = `Found booking: "${event.summary}" on ${start}. Event ID: ${event.id}. Description: ${event.description || 'none'}`;
                        } else {
                            toolResult = 'No upcoming booking found for this person. They may not have a booking, or it may have already passed.';
                        }
                    } else if (functionCall.name === 'cancel_booking') {
                        await calendarService.deleteEvent(args.eventId);
                        toolResult = 'Booking has been cancelled successfully. Confirm this to the prospect in a friendly way.';
                    } else if (functionCall.name === 'reschedule_booking') {
                        const updated = await calendarService.updateEvent(args.eventId, {
                            startTime: args.newStartTime,
                            endTime: args.newEndTime,
                        });
                        const newTime = new Date(args.newStartTime).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                        toolResult = `Booking "${updated.summary}" has been rescheduled to ${newTime}. Confirm this to the prospect in a friendly way. Do NOT share any links.`;
                    }
                } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : 'Unknown error';
                    console.error('Tool call failed:', errMsg);
                    toolResult = `Error executing tool: ${errMsg}`;
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolResult,
                });
            }

            response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages,
                tools: this.config.google_refresh_token ? this.getCalendarTools() : undefined,
            });
            responseMessage = response.choices[0].message;
        }

        const rawReply = responseMessage.content || '';
        let replies: string[];

        if (rawReply.includes('|||')) {
            replies = rawReply.split('|||').map(s => s.trim()).filter(Boolean);
        } else if (this.config.reply_mode === 'conversational') {
            // Fallback: AI didn't use the delimiter — split into conversational chunks
            replies = this.splitIntoConversationalChunks(rawReply);
        } else {
            replies = [rawReply.trim()].filter(Boolean);
        }

        // 5. Save to Memory
        try {
            await this.zep.thread.addMessages(sessionId, {
                messages: [
                    { role: 'user', content: message },
                    { role: 'assistant', content: rawReply },
                ],
            });
        } catch (memError) {
            console.error('Failed to save memory to Zep:', memError);
        }

        return replies;
    }

    private async ensureZepSession(sessionId: string, data: PlatformData): Promise<void> {
        try {
            await this.zep.user.get(sessionId);
        } catch (e) {
            await this.zep.user.add({
                userId: sessionId,
                firstName: data.first_name || 'Guest',
                metadata: { ...data },
            });
            try {
                await this.zep.thread.create({ threadId: sessionId, userId: sessionId });
            } catch (createError) {
                console.log('Thread creation marked as existing or failed:', createError);
            }
        }
    }

    async analyzeLead(profileData: Record<string, unknown>): Promise<string | null> {
        const prompt = `
        You are a Lead Analysis Expert. Your task is to create an accurate user profile based on lead information provided to you, without adding any information not provided.

        Output the following information:

        First Name: (if there is a first name present)
        Occupation: (the leads occupation, if mentioned)
        Age: (the leads age, if mentioned)
        Gender: (the leads gender, if obvious)
        Personalization: (specific details about the lead which can be used to personalize a message)
        Topics: (topics the lead talks about)
        ICP: Yes/No

        **ICP CRITERIA - Mark as "Yes" if 2+ criteria are met:**

        PRIMARY QUALIFIERS (high weight):
        - Shows evidence of owning/running a business (entrepreneur, founder, CEO, coach, consultant, agency owner, course creator, freelancer)
        - Mentions selling products/services online
        - References Instagram marketing, social media marketing, or DM sales
        - Indicates current revenue/income from business activities

        SECONDARY QUALIFIERS (medium weight):
        - Shows interest in: online marketing, lead generation, sales, business growth, scaling
        - Mentions coaching, consulting, or service-based business
        - References making money online, passive income, or entrepreneurship
        - Has business-related content in bio/posts
        - Male (matches primary demographic but not required)

        DISQUALIFIERS (automatic "NO ICP MATCH"):
        - Corporate employee with no side business indicators
        - Student with no entrepreneurial interests
        - Clearly personal/lifestyle account only
        - No business/entrepreneurship indicators whatsoever

        RULES:

        If any lead information includes a website link, such as a business website (.com .co .ai), remove the domain ending and keep just the business name.

        Lead Data:
        ${JSON.stringify(profileData, null, 2)}
    `;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'system', content: prompt }],
        });

        return response.choices[0].message.content;
    }

    private getCalendarTools(): OpenAI.Chat.ChatCompletionTool[] {
        return [
            {
                type: 'function',
                function: {
                    name: 'check_calendar_availability',
                    description: 'Checks the calendar and returns available time slots. Call this with a 2-day range starting tomorrow (9am-5pm) when the prospect wants to book. Today\'s date is ' + new Date().toISOString(),
                    parameters: {
                        type: 'object',
                        properties: {
                            timeMin: {
                                type: 'string',
                                description: 'The start of the time range to check (ISO format, e.g., 2026-02-23T09:00:00Z)',
                            },
                            timeMax: {
                                type: 'string',
                                description: 'The end of the time range to check (ISO format, e.g., 2026-02-26T17:00:00Z)',
                            },
                        },
                        required: ['timeMin', 'timeMax'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'book_appointment',
                    description: 'Books an appointment on the calendar. Only call this AFTER the prospect has chosen a time AND provided their name and email.',
                    parameters: {
                        type: 'object',
                        properties: {
                            summary: {
                                type: 'string',
                                description: 'The title of the event, format: "Strategy Call — [Prospect Name]"',
                            },
                            startTime: {
                                type: 'string',
                                description: 'Start time of the event (ISO format)',
                            },
                            endTime: {
                                type: 'string',
                                description: 'End time of the event (ISO format, typically 1 hour after start)',
                            },
                            description: {
                                type: 'string',
                                description: 'MUST include all of: Name, Email, Instagram handle (@username), and any conversation notes. Format:\nName: [name]\nEmail: [email]\nInstagram: @[username]\nNotes: [any relevant details]',
                            },
                        },
                        required: ['summary', 'startTime', 'endTime', 'description'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'find_booking',
                    description: 'Searches for an existing upcoming booking by the prospect\'s Instagram username or name. Use this when a prospect wants to cancel or reschedule.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Search term — use the prospect\'s Instagram username (e.g., "the.real.charlie.b") or name',
                            },
                        },
                        required: ['query'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'cancel_booking',
                    description: 'Cancels an existing booking. You MUST call find_booking first to get the event ID. Confirm with the prospect before cancelling.',
                    parameters: {
                        type: 'object',
                        properties: {
                            eventId: {
                                type: 'string',
                                description: 'The event ID returned by find_booking',
                            },
                        },
                        required: ['eventId'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'reschedule_booking',
                    description: 'Reschedules an existing booking to a new time. You MUST call find_booking first to get the event ID, and check_calendar_availability to find open slots.',
                    parameters: {
                        type: 'object',
                        properties: {
                            eventId: {
                                type: 'string',
                                description: 'The event ID returned by find_booking',
                            },
                            newStartTime: {
                                type: 'string',
                                description: 'New start time (ISO format)',
                            },
                            newEndTime: {
                                type: 'string',
                                description: 'New end time (ISO format, typically 1 hour after start)',
                            },
                        },
                        required: ['eventId', 'newStartTime', 'newEndTime'],
                    },
                },
            }
        ];
    }

    private formatAvailabilityResult(busySlots: { start: string; end: string }[], timeMin: string, timeMax: string): string {
        // Compute available 1-hour slots during business hours (9am-5pm)
        // Only check tomorrow and the day after (skip today)
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const endDate = new Date(timeMax);
        const availableSlots: string[] = [];

        const current = new Date(tomorrow);

        let daysChecked = 0;
        while (current <= endDate && daysChecked < 2) {
            const dayStr = current.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

            for (let hour = 9; hour < 17; hour++) {
                const slotStart = new Date(current);
                slotStart.setHours(hour, 0, 0, 0);
                const slotEnd = new Date(current);
                slotEnd.setHours(hour + 1, 0, 0, 0);

                // Check if this slot overlaps with any busy period
                const isBusy = busySlots.some(busy => {
                    const busyStart = new Date(busy.start);
                    const busyEnd = new Date(busy.end);
                    return slotStart < busyEnd && slotEnd > busyStart;
                });

                if (!isBusy) {
                    const timeStr = slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    availableSlots.push(`${dayStr} at ${timeStr}`);
                }
            }
            current.setDate(current.getDate() + 1);
            daysChecked++;
        }

        if (availableSlots.length === 0) {
            return 'No available slots found in the requested time range. Ask the prospect if another date range works.';
        }

        // Pick 1 slot per day (first available)
        const slotsByDay = new Map<string, string[]>();
        for (const slot of availableSlots) {
            const day = slot.split(' at ')[0];
            if (!slotsByDay.has(day)) slotsByDay.set(day, []);
            slotsByDay.get(day)!.push(slot);
        }

        const recommendations: string[] = [];
        for (const [, slots] of slotsByDay) {
            recommendations.push(slots[0]);
        }

        return `AVAILABLE SLOTS:\n${recommendations.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nINSTRUCTIONS: Send EACH option as its own separate message. Example: first message "I've got a couple times open 👇", then a separate message "1. ${recommendations[0] || 'Tomorrow at 10am'}", then another separate message "2. ${recommendations[1] || 'Wednesday at 2pm'}". Then ask which works best in a final message. NEVER list both options in one message.`;
    }

    private splitIntoConversationalChunks(text: string): string[] {
        // Split a long reply into short, DM-style messages
        // Strategy: split on sentence boundaries, then group into chunks of 1-2 sentences
        const sentences = text
            .replace(/([.!?])\s+/g, '$1|||')
            .split('|||')
            .map(s => s.trim())
            .filter(Boolean);

        if (sentences.length <= 1) return [text.trim()];

        // Group into chunks of 1-2 sentences each to feel conversational
        const chunks: string[] = [];
        let i = 0;
        while (i < sentences.length) {
            // Randomly group 1 or 2 sentences per message for natural variation
            const groupSize = (sentences.length - i > 2 && Math.random() > 0.4) ? 1 : Math.min(2, sentences.length - i);
            const chunk = sentences.slice(i, i + groupSize).join(' ');
            if (chunk.length > 0) chunks.push(chunk);
            i += groupSize;
        }

        return chunks.length > 0 ? chunks : [text.trim()];
    }

    private buildSystemPrompt(data: Record<string, string>, replyMode: string = 'single_block', hasCalendar: boolean = false): string {
        const name = data.agent_name || 'AI Assistant';
        const backstory = data.agent_backstory || 'You are unmatched in your helpfulness.';
        const knowledge = data.knowledge_base || 'No specific knowledge base provided.';
        const context = data.business_description || 'A generic business.';
        const customInstructions = data.custom_instructions || '';

        return `
      MASTER INSTRUCTIONS (HIGHEST PRIORITY):
      ${customInstructions ? customInstructions : 'You are a helpful assistant.'}

      You are ${name}.

      BACKSTORY:
      ${backstory}

      BUSINESS CONTEXT:
      ${context}

      KNOWLEDGE BASE:
      ${knowledge}

      ${replyMode === 'conversational' ? `
      REPLY FORMAT — NON-NEGOTIABLE:
      You are texting on Instagram DMs. You MUST write like a real person texting — short, punchy, one thought per message.

      RULES:
      - Split EVERY response into 2-5 separate short messages.
      - Use the EXACT delimiter "|||" between each message. No exceptions.
      - Each message should be 1-2 sentences MAX. Never write a paragraph.
      - Think of each "|||" as pressing "send" on your phone before typing the next message.
      - NEVER send a single long message. ALWAYS split.

      GOOD EXAMPLE:
      "Hey Charlie! 👋 ||| Saw you're in the fitness space — that's awesome ||| What kind of clients are you working with right now? ||| And are you booking calls through Instagram or do you have another system?"

      BAD EXAMPLE (never do this):
      "Hey Charlie! Saw you're in the fitness space, that's awesome. What kind of clients are you working with right now? And are you booking calls through Instagram or do you have another system?"
      ` : ''}

      GENERAL RULES:
      - Keep answers concise and relevant.
      - Use the knowledge base to answer questions.
      - If you don't know, ask for clarification.
      ${replyMode === 'conversational' ? '- REMEMBER: Split every reply with "|||". This is your #1 formatting rule.' : ''}

      ${hasCalendar ? `
      CALENDAR & BOOKING RULES (CRITICAL):
      You have access to the user's Google Calendar. Today's Date and Time is: ${new Date().toISOString()}

      BOOKING FLOW — follow this exact sequence:
      STEP 1: When the prospect is ready to book, call 'check_calendar_availability' for tomorrow and the next day (2-day range, 9am-5pm).
      STEP 2: The tool returns 2 options (1 per day). Send EACH option as its own separate message:
        - First message: "I've got a couple times open 👇"
        - Second message: "1. [Day] at [Time]"
        - Third message: "2. [Day] at [Time]"
        - Fourth message: "Which one works better for you?"
      STEP 3: When the prospect picks a time, ask for their full name and email address before booking.
      STEP 4: Once you have their name and email, call 'book_appointment' with their details in the description.
      STEP 5: Confirm the booking in a friendly way. Do NOT send any links or URLs — just say "You're all booked in for [day] at [time]! Looking forward to it 🙌"

      CANCELLATION / RESCHEDULING FLOW:
      - If a prospect wants to cancel: call 'find_booking' with their username → confirm the booking details with them → call 'cancel_booking' with the event ID → confirm cancellation.
      - If a prospect wants to reschedule: call 'find_booking' with their username → confirm current booking → call 'check_calendar_availability' for new dates → present new options → call 'reschedule_booking' with the event ID and new time.

      RULES:
      - NEVER suggest a time without checking the calendar first.
      - NEVER book without collecting the prospect's name and email.
      - NEVER share Google Calendar links, event URLs, or any links with the prospect.
      - Only offer times that the tool returned as available.
      - If no times work for the prospect, check the next 3 days.
      - ALWAYS include the prospect's Instagram username in the booking description so it can be found later.
      - ALWAYS confirm with the prospect before cancelling or rescheduling.
      ` : ''}
    `;
    }
}
