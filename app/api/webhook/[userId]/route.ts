import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

export async function GET() {
    return NextResponse.json({ status: 'active', message: 'InstaDM Webhook is online' });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    const { userId } = await params;

    // Fast-Return if QStash isn't configured in environment
    if (!process.env.QSTASH_TOKEN) {
        return NextResponse.json({ error: 'QStash Background Queue is not configured. Add QSTASH_TOKEN to your environment.' }, { status: 500 });
    }

    try {
        const body = await req.json();

        const qstash = new Client({ token: process.env.QSTASH_TOKEN });

        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        const host = req.headers.get('host');
        const baseUrl = appUrl || (host?.includes('localhost') ? `http://${host}` : `https://${host}`);
        const workerUrl = `${baseUrl}/api/worker/${userId}`;

        // Send payload to Upstash QStash, which instantly responds to us 
        // and then asynchronously pings the heavy /worker endpoint
        const messageId = await qstash.publishJSON({
            url: workerUrl,
            body: { payload: body },
            retries: 0, // Disable automatic retries for chat to prevent duplicate answers
            timeout: '30s', // Gives Vercel Hobby tier its max, or Pro tier whatever it's set to
        });

        // Respond to ManyChat in under 500ms so it never times out
        return NextResponse.json({
            status: 'queued',
            message: 'Webhook successfully offloaded to background worker.',
            messageId,
            workerUrl
        });

    } catch (e: any) {
        console.error('Webhook Intake Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
