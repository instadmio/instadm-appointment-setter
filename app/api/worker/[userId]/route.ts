import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentService } from '@/services/agent.service';
import { ScrapeService } from '@/services/scrape.service';
import { ManyChatService } from '@/services/manychat.service';
import { createServiceClient } from '@/utils/supabase/service';
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs';
import type { AgentConfig } from '@/types';

// Zod schema for webhook payload — passthrough allows extra ManyChat fields
const WebhookPayloadSchema = z.object({
    subscriber_id: z.union([z.string(), z.number()]).optional(),
    sessionId: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
    last_input_text: z.string().optional(),
    first_name: z.string().optional(),
    name: z.string().optional(),
    username: z.string().optional(),
}).passthrough();

const QStashBodySchema = z.object({
    payload: WebhookPayloadSchema.optional(),
}).passthrough();

async function handler(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    let supabase;
    try {
        supabase = createServiceClient();
    } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: 'Service client init failed', detail: errMsg }, { status: 500 });
    }
    const { userId } = await params;

    const logEvent = async (level: 'info' | 'error' | 'success', event: string, details: Record<string, unknown>) => {
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

        if (!dbConfig || !dbConfig.manychat_key) {
            await logEvent('error', 'Missing Config', { hasConfig: !!dbConfig, manychat: !!dbConfig?.manychat_key });
            return NextResponse.json({ error: 'Configuration incomplete. Please add your ManyChat API key.' }, { status: 500 });
        }

        // 2. Parse & Validate Webhook Payload
        const rawBody = await req.json();
        const parseResult = QStashBodySchema.safeParse(rawBody);

        if (!parseResult.success) {
            await logEvent('error', 'Invalid Payload Schema', { errors: parseResult.error.flatten() });
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
        }

        const body = parseResult.data;
        const raw = body.payload || body;
        // Normalize to a plain record for safe field access
        const payload = raw as Record<string, unknown>;

        await logEvent('info', 'QStash Worker Started', payload);

        // Normalize field names from different ManyChat payload formats
        const subscriberId = String(payload.subscriber_id || payload.sessionId || payload.id || '');
        const message = String(payload.message || payload.last_input_text || '');
        const firstName = String(payload.first_name || payload.name || '');
        const username = String(payload.username || '');

        if (!subscriberId || !message) {
            await logEvent('error', 'Invalid Payload', payload as Record<string, unknown>);
            return NextResponse.json({ error: 'Missing subscriber_id or message' }, { status: 400 });
        }

        const agent = new AgentService(dbConfig as AgentConfig);
        const scraper = new ScrapeService(process.env.DATAPRISM_API_KEY || '');
        const manychat = new ManyChatService(dbConfig.manychat_key);

        // Lead Analysis
        let profileAnalysis: string | undefined;
        let profileRaw: Record<string, unknown> | undefined;
        try {
            const subscriber = await manychat.getSubscriber(subscriberId);
            const customFields = subscriber?.custom_fields || {};
            const hasAnalyzed = customFields['icp_status'] || customFields['analysis_complete'];

            if (!hasAnalyzed && username) {
                await logEvent('info', 'Analyzing User', { username });
                const profileData = await scraper.scrapeProfile(username);

                if (profileData) {
                    profileRaw = profileData;
                    const analysis = await agent.analyzeLead(profileData);
                    const isICP = analysis ? analysis.includes('ICP: Yes') : false;
                    profileAnalysis = analysis || undefined;

                    await manychat.setCustomFields(subscriberId, {
                        icp_status: isICP ? 'Qualified' : 'Unqualified',
                        analysis_raw: analysis ? analysis.substring(0, 2000) : '',
                        params: 'analyzed'
                    });
                    await logEvent('success', 'Analysis Complete', { isICP });
                }
            } else if (customFields['analysis_raw']) {
                // Reuse existing analysis from a previous scrape
                profileAnalysis = String(customFields['analysis_raw']);
            }
        } catch (analysisError: unknown) {
            const errMsg = analysisError instanceof Error ? analysisError.message : 'Unknown error';
            await logEvent('error', 'Analysis Failed', { error: errMsg });
        }

        // Chat Flow & Tools
        try {
            await logEvent('info', 'Chat Context', { hasProfileAnalysis: !!profileAnalysis, hasProfileRaw: !!profileRaw, username, firstName });
            const zepId = username || subscriberId;
            const replies = await agent.processMessage(userId, zepId, message, { first_name: firstName, username, profile_analysis: profileAnalysis, profile_raw: profileRaw });

            if (replies && replies.length > 0) {
                await manychat.sendContent(subscriberId, replies);
                await logEvent('success', 'Reply Sent', { replies });
                return NextResponse.json({ status: 'success', replies });
            } else {
                await logEvent('info', 'No Reply Generated', { message });
                return NextResponse.json({ status: 'success', message: 'No reply generated' });
            }
        } catch (chatError: unknown) {
            const errMsg = chatError instanceof Error ? chatError.message : 'Unknown error';
            await logEvent('error', 'Chat Flow Failed', { error: errMsg });
            return NextResponse.json({ status: 'error', error: errMsg }, { status: 500 });
        }

    } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        console.error('Worker Error:', e);
        try {
            await supabase.from('webhook_logs').insert({
                user_id: userId,
                level: 'error',
                event: 'Fatal Worker Error',
                details: { error: errMsg }
            });
        } catch { }

        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

export const POST = async (req: NextRequest, ctx: { params: Promise<{ userId: string }> }) => {
    if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
        console.error("QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY must be set");
        return NextResponse.json({ error: "QStash Configuration missing" }, { status: 500 });
    }
    const verifiedHandler = verifySignatureAppRouter(handler);
    return verifiedHandler(req, ctx as unknown as { params: Promise<{ userId: string }> });
};
