import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agent.service';
import { ScrapeService } from '@/services/scrape.service';
import { ManyChatService } from '@/services/manychat.service';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
    return NextResponse.json({ status: 'active', message: 'InstaDM Webhook is online' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    const supabase = await createClient();
    const { userId } = await params;

    try {
        // 1. Fetch Config from DB
        // For now, we fetch from a mocked source or env if DB is empty
        let config: any = {
            prompt_data: {
                agent_name: 'InstaDM Agent',
                agent_backstory: 'You are a helpful assistant.',
            },
            openai_key: process.env.OPENAI_API_KEY || '',
            manychat_key: process.env.MANYCHAT_API_KEY || '',
            // zep_key? (using env for now)
        };

        const { data: dbConfig } = await supabase
            .from('agent_configs')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (dbConfig) {
            // Only override if dbConfig has a value, otherwise keep the env value (if user saved empty string)
            const resolvedOpenAI = dbConfig.openai_key || config.openai_key;
            const resolvedManyChat = dbConfig.manychat_key || config.manychat_key;
            const resolvedPromptData = dbConfig.prompt_data || config.prompt_data;

            config = {
                ...config,
                ...dbConfig,
                prompt_data: resolvedPromptData,
                openai_key: resolvedOpenAI,
                manychat_key: resolvedManyChat
            };
        }

        if (!config.openai_key || !config.manychat_key) {
            console.error(`[Agent ${userId}] Missing API Keys. OpenAI: ${!!config.openai_key}, ManyChat: ${!!config.manychat_key}`);
            return NextResponse.json({ error: 'Configuration incomplete', details: { openai: !!config.openai_key, manychat: !!config.manychat_key } }, { status: 500 });
        }

        // 2. Parse Webhook
        const body = await req.json();
        let { subscriber_id, message, first_name, username } = body;

        // Map fields from common ManyChat payloads if exact matches aren't found
        subscriber_id = subscriber_id || body.sessionId || body.id;
        first_name = first_name || body.name;

        // Note: ManyChat webhook usually sends 'username' if available, otherwise we might need to fetch it.
        // If message is missing, check specific ManyChat fields like 'last_input_text'
        message = message || body.last_input_text;

        if (!subscriber_id || !message) {
            console.error('[Webhook] Invalid Payload:', body);
            return NextResponse.json({ error: 'Invalid Payload' }, { status: 400 });
        }

        // 3. Respond Immediately to Prevent Timeout
        // ManyChat waits max 10s. AI + Scraping takes longer.
        // We start the background process and return 200 OK immediately.

        (async () => {
            try {
                // 3a. Initialize Services
                const agent = new AgentService(config);
                const scraper = new ScrapeService(process.env.DATAPRISM_API_KEY || '');
                const manychat = new ManyChatService(config.manychat_key);

                // 3b. Lead Analysis Flow (Simplified)
                const subscriber = await manychat.getSubscriber(subscriber_id.toString());
                const customFields = subscriber?.custom_fields || {};
                const hasAnalyzed = customFields['icp_status'] || customFields['analysis_complete'];

                if (!hasAnalyzed && username) {
                    console.log(`[Agent ${userId}] Analyzing lead: ${username}`);
                    const profileData = await scraper.scrapeProfile(username);

                    if (profileData) {
                        const analysis = await agent.analyzeLead(profileData);
                        console.log(`[Agent ${userId}] Analysis complete for ${username}`);
                        const isICP = analysis ? analysis.includes('ICP: Yes') : false;

                        await manychat.setCustomFields(subscriber_id.toString(), {
                            icp_status: isICP ? 'Qualified' : 'Unqualified',
                            analysis_raw: analysis ? analysis.substring(0, 2000) : '',
                            params: 'analyzed'
                        });
                        console.log(`[Agent ${userId}] ManyChat fields updated for ${subscriber_id}`);
                    }
                }

                // 3c. Chat Flow
                // Use Instagram handle (username) as Zep Session ID for readability, fallback to subscriber_id
                const zepId = username || subscriber_id.toString();

                console.log(`[Agent ${userId}] Processing message from ${subscriber_id} (Zep ID: ${zepId})`);
                const reply = await agent.processMessage(
                    userId,
                    zepId,
                    message,
                    { first_name, username }
                );
                console.log(`[Agent ${userId}] AI Reply generated: ${reply}`);

                // 3d. Send Reply
                if (reply) {
                    console.log(`[Agent ${userId}] Sending reply to ${subscriber_id}`);
                    await manychat.sendContent(subscriber_id.toString(), [reply]);
                    console.log(`[Agent ${userId}] Reply sent successfully`);
                }
            } catch (bgError: any) {
                console.error(`[Agent ${userId}] Background Process Error:`, bgError);
            }
        })();

        return NextResponse.json({ status: 'queued', message: 'Processing in background' });

    } catch (e: any) {
        console.error('Webhook Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
