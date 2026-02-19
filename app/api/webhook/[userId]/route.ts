import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agent.service';
import { ScrapeService } from '@/services/scrape.service';
import { ManyChatService } from '@/services/manychat.service';
import { createServiceClient } from '@/utils/supabase/service';

export async function GET() {
    return NextResponse.json({ status: 'active', message: 'InstaDM Webhook is online' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    let supabase;
    try {
        supabase = createServiceClient();
    } catch (e: any) {
        return NextResponse.json({ error: 'Service client init failed', detail: e.message }, { status: 500 });
    }
    const { userId } = await params;

    // Helper: Log to DB
    const logEvent = async (level: 'info' | 'error' | 'success', event: string, details: any) => {
        try {
            await supabase.from('webhook_logs').insert({
                user_id: userId,
                level,
                event,
                details
            });
        } catch (err) {
            console.error('Logging Error:', err);
        }
    };

    try {
        // 1. Fetch Config from DB
        let config: any = {
            prompt_data: {
                agent_name: 'InstaDM Agent',
                agent_backstory: 'You are a helpful assistant.',
            },
            openai_key: process.env.OPENAI_API_KEY || '',
            manychat_key: process.env.MANYCHAT_API_KEY || '',
        };

        const { data: dbConfig } = await supabase
            .from('agent_configs')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (dbConfig) {
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
            await logEvent('error', 'Missing Keys', { openai: !!config.openai_key, manychat: !!config.manychat_key });
            return NextResponse.json({ error: 'Configuration incomplete' }, { status: 500 });
        }

        // 2. Parse Webhook
        const body = await req.json();
        await logEvent('info', 'Webhook Received', body);

        let { subscriber_id, message, first_name, username } = body;

        subscriber_id = subscriber_id || body.sessionId || body.id;
        first_name = first_name || body.name;
        message = message || body.last_input_text;

        if (!subscriber_id || !message) {
            await logEvent('error', 'Invalid Payload', body);
            return NextResponse.json({ error: 'Invalid Payload' }, { status: 400 });
        }

        // 3. Process synchronously (Vercel kills serverless functions after response is sent)
        const agent = new AgentService(config);
        const scraper = new ScrapeService(process.env.DATAPRISM_API_KEY || '');
        const manychat = new ManyChatService(config.manychat_key);

        // Lead Analysis
        try {
            const subscriber = await manychat.getSubscriber(subscriber_id.toString());
            const customFields = subscriber?.custom_fields || {};
            const hasAnalyzed = customFields['icp_status'] || customFields['analysis_complete'];

            if (!hasAnalyzed && username) {
                await logEvent('info', 'Analyzing User', { username });
                const profileData = await scraper.scrapeProfile(username);

                if (profileData) {
                    const analysis = await agent.analyzeLead(profileData);
                    const isICP = analysis ? analysis.includes('ICP: Yes') : false;

                    await manychat.setCustomFields(subscriber_id.toString(), {
                        icp_status: isICP ? 'Qualified' : 'Unqualified',
                        analysis_raw: analysis ? analysis.substring(0, 2000) : '',
                        params: 'analyzed'
                    });
                    await logEvent('success', 'Analysis Complete', { isICP });
                }
            }
        } catch (analysisError: any) {
            await logEvent('error', 'Analysis Failed', { error: analysisError.message });
            // Continue to chat flow even if analysis fails
        }

        // Chat Flow
        try {
            const zepId = username || subscriber_id.toString();
            const reply = await agent.processMessage(userId, zepId, message, { first_name, username });

            if (reply) {
                await manychat.sendContent(subscriber_id.toString(), [reply]);
                await logEvent('success', 'Reply Sent', { reply });
                return NextResponse.json({ status: 'success', reply });
            } else {
                await logEvent('info', 'No Reply Generated', { message });
                return NextResponse.json({ status: 'success', message: 'No reply generated' });
            }
        } catch (chatError: any) {
            await logEvent('error', 'Chat Flow Failed', { error: chatError.message });
            return NextResponse.json({ status: 'error', error: chatError.message }, { status: 500 });
        }

    } catch (e: any) {
        console.error('Webhook Error:', e);
        // Can't use user_id if we failed before fetching it? Wait, we have userId from params.
        // But logging helper is defined inside.
        // We can just try to log if possible.
        try {
            await supabase.from('webhook_logs').insert({
                user_id: userId,
                level: 'error',
                event: 'Fatal Webhook Error',
                details: { error: e.message }
            });
        } catch { }

        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
