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
                        toolResult = busySlots.length === 0
                            ? 'The calendar is completely free during this time.'
                            : `The following slots are busy: ${JSON.stringify(busySlots)} (Advise the user to pick times around these busy slots).`;
                    } else if (functionCall.name === 'book_appointment') {
                        const booking = await calendarService.createBooking(args.summary, args.startTime, args.endTime, args.description);
                        toolResult = `Booking successful! Event Link: ${booking.htmlLink}`;
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
        const replies = rawReply.split('|||').map(s => s.trim()).filter(Boolean);

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
                    description: 'Checks the users Google Calendar for busy slots between a specific start and end time. Always use this before offering or confirming a meeting time. Today\'s date is ' + new Date().toISOString(),
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
                    description: 'Books an appointment on the users Google Calendar. Call this when the customer explicitly agrees to a time slot.',
                    parameters: {
                        type: 'object',
                        properties: {
                            summary: {
                                type: 'string',
                                description: 'The title of the event (e.g., "Consultation Call with [Name]")',
                            },
                            startTime: {
                                type: 'string',
                                description: 'Start time of the event (ISO format)',
                            },
                            endTime: {
                                type: 'string',
                                description: 'End time of the event (ISO format)',
                            },
                            description: {
                                type: 'string',
                                description: 'Notes regarding the meeting (e.g., Instagram Handle of the prospect)',
                            },
                        },
                        required: ['summary', 'startTime', 'endTime'],
                    },
                },
            }
        ];
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

      GENERAL RULES:
      - Keep answers concise and relevant.
      - Use the knowledge base to answer questions.
      - If you don't know, ask for clarification.

      ${hasCalendar ? `
      CALENDAR & BOOKING RULES (CRITICAL):
      - You have access to the user's Google Calendar via Tools.
      - ALWAYS call the 'check_calendar_availability' tool before suggesting specific dates or times to the prospect.
      - Never double-book. Do not guess wait times. Base availability strictly on the tool's response.
      - If a user agrees to a time, ALWAYS call the 'book_appointment' tool to secure the event on the calendar before confirming with the user.
      - Today's Date and Time is: ${new Date().toISOString()}
      ` : ''}

      ${replyMode === 'conversational' ? `
      REPLY FORMATTING (CRITICAL):
      You must break your response into multiple short, conversational messages.
      Separate each distinct message, thought, or question with the exact delimiter "|||".
      Example: "Hey, thanks for reaching out! ||| I see that you're an online fitness coach? How is that going so far?"
      ` : ''}
    `;
    }
}
