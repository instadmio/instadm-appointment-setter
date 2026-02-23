import { NextRequest, NextResponse } from 'next/server';
import { AgentService } from '@/services/agent.service';
import { ScrapeService } from '@/services/scrape.service';
import { ManyChatService } from '@/services/manychat.service';
import { createServiceClient } from '@/utils/supabase/service';
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs';

async function handler(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
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
        const { data: dbConfig } = await supabase
            .from('agent_configs')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!dbConfig || !dbConfig.openai_key || !dbConfig.manychat_key) {
            await logEvent('error', 'Missing Keys or Config', { openai: !!dbConfig?.openai_key, manychat: !!dbConfig?.manychat_key });
            return NextResponse.json({ error: 'Configuration incomplete' }, { status: 500 });
        }

        // 2. Parse Webhook
        const body = await req.json();
        const payload = body.payload || body; // Handle structure if forwarded dynamically

        await logEvent('info', 'QStash Worker Started', payload);

        let { subscriber_id, message, first_name, username } = payload;

        subscriber_id = subscriber_id || payload.sessionId || payload.id;
        first_name = first_name || payload.name;
        message = message || payload.last_input_text;

        if (!subscriber_id || !message) {
            await logEvent('error', 'Invalid Payload', payload);
            return NextResponse.json({ error: 'Invalid Payload' }, { status: 400 });
        }

        const agent = new AgentService(dbConfig);
        const scraper = new ScrapeService(process.env.DATAPRISM_API_KEY || '');
        const manychat = new ManyChatService(dbConfig.manychat_key);

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
        }

        // Chat Flow & Tools
        try {
            const zepId = username || subscriber_id.toString();
            const replies = await agent.processMessage(userId, zepId, message, { first_name, username });

            if (replies && replies.length > 0) {
                await manychat.sendContent(subscriber_id.toString(), replies);
                await logEvent('success', 'Reply Sent', { replies });
                return NextResponse.json({ status: 'success', replies });
            } else {
                await logEvent('info', 'No Reply Generated', { message });
                return NextResponse.json({ status: 'success', message: 'No reply generated' });
            }
        } catch (chatError: any) {
            await logEvent('error', 'Chat Flow Failed', { error: chatError.message });
            return NextResponse.json({ status: 'error', error: chatError.message }, { status: 500 });
        }

    } catch (e: any) {
        console.error('Worker Error:', e);
        try {
            await supabase.from('webhook_logs').insert({
                user_id: userId,
                level: 'error',
                event: 'Fatal Worker Error',
                details: { error: e.message }
            });
        } catch { }

        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Ensure QStash Signature is valid before processing to prevent unauthorized triggers
export const POST = verifySignatureAppRouter(handler);
