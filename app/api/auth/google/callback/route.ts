import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/service';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const userId = searchParams.get('state');

    if (!code || !userId) {
        return NextResponse.json({ error: 'Missing code or state params.' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const host = req.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId!,
                client_secret: clientSecret!,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }),
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            console.error("Token exchange failed:", tokens);
            throw new Error(tokens.error_description || tokens.error);
        }

        if (tokens.refresh_token) {
            const supabase = createServiceClient();

            const { error: updateError } = await supabase
                .from('agent_configs')
                .update({ google_refresh_token: tokens.refresh_token })
                .eq('user_id', userId);

            if (updateError) {
                console.error("Supabase update error:", updateError);
                return NextResponse.json({ error: 'Failed to save refresh token to database', details: updateError }, { status: 500 });
            }
        }

        const baseUrl = `${protocol}://${host}`;
        return NextResponse.redirect(new URL('/dashboard?calendar=success', baseUrl));

    } catch (error: any) {
        console.error("Google Auth Exchange Error:", error.message);
        return NextResponse.json({ error: 'Failed to exchange token with Google' }, { status: 500 });
    }
}
