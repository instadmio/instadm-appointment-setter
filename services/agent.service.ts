import OpenAI from 'openai';
import { ZepClient } from '@getzep/zep-cloud';
import { createClient } from '@/utils/supabase/server';

interface AgentConfig {
    prompt_data: Record<string, string>;
    openai_key: string;
    // zep_key? // We might use a central Zep key for the platform or user-provided
}

export class AgentService {
    private openai: OpenAI;
    private zep: ZepClient;
    private config: AgentConfig;

    constructor(config: AgentConfig) {
        this.config = config;
        this.openai = new OpenAI({ apiKey: config.openai_key });
        // Assuming Zep is platform-wide for now, but could be user-specific
        this.zep = new ZepClient({
            apiKey: process.env.ZEP_API_KEY!,
        });
    }

    async processMessage(userId: string, sessionId: string, message: string, platformData: any) {
        // 1. Check Zep User/Thread
        await this.ensureZepSession(sessionId, platformData);

        // 2. Fetch History
        let history: any[] = [];
        try {
            const thread = await this.zep.thread.get(sessionId);
            history = thread.messages || [];
        } catch (e) {
            // Thread might not exist yet, which is fine
            console.log(`Thread ${sessionId} not found or empty. Attempting creation...`);
            try {
                await this.zep.thread.create({ threadId: sessionId, userId: sessionId });
                console.log(`Thread ${sessionId} created successfully.`);
            } catch (createErr) {
                console.error(`Failed to create thread ${sessionId}:`, createErr);
            }
        }

        // 3. Construct Prompt
        const systemPrompt = this.buildSystemPrompt(this.config.prompt_data);

        // 4. Generate Response
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: systemPrompt },
                ...history.map((m: any) => ({ role: m.role ?? m.roleType, content: m.content })),
                { role: 'user', content: message },
            ],
        });

        const reply = response.choices[0].message.content;

        // 5. Save to Memory
        try {
            await this.zep.thread.addMessages(sessionId, {
                messages: [
                    { role: 'user', content: message },
                    { role: 'assistant', content: reply || '' },
                ],
            });
        } catch (memError) {
            console.error('Failed to save memory to Zep:', memError);
            // Non-blocking: We still return the reply
        }

        return reply;
    }

    private async ensureZepSession(sessionId: string, data: any) {
        try {
            await this.zep.user.get(sessionId);
        } catch (e) {
            // User doesn't exist, create User & Thread
            await this.zep.user.add({
                userId: sessionId,
                firstName: data.first_name || 'Guest',
                metadata: { ...data },
            });
            // Thread creation might be needed if explicit session tracking is required
            // Thread creation might be needed if explicit session tracking is required
            try {
                // Try to create the session/thread associated with the user
                // Re-reading docs (mental check): Zep Cloud v2 uses 'session'. 'thread' might be legacy mapping or specific helper.
                // Safest bet: Just wrap addMessages in try-catch to not block the reply.
                await this.zep.thread.create({ threadId: sessionId, userId: sessionId });
            } catch (createError) {
                console.log('Thread creation marked as existing or failed:', createError);
            }
        }
    }

    async analyzeLead(profileData: any) {
        const prompt = `
        =You are a Lead Analysis Expert. Your task is to create an accurate user profile based on lead information provided to you, without adding any information not provided.

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

    private buildSystemPrompt(data: Record<string, string>): string {
        // Dynamic Prompt Construction
        // Default fallback values
        const name = data.agent_name || 'AI Assistant';
        const backstory = data.agent_backstory || 'You are unmatched in your helpfulness.';
        const knowledge = data.knowledge_base || 'No specific knowledge base provided.';
        const context = data.business_description || 'A generic business.';

        return `
      You are ${name}.
      
      BACKSTORY:
      ${backstory}
      
      BUSINESS CONTEXT:
      ${context}
      
      KNOWLEDGE BASE:
      ${knowledge}
      
      INSTRUCTIONS:
      - Keep answers concise and relevant.
      - Use the knowledge base to answer questions.
      - If you don't know, ask for clarification.
    `;
    }
}
