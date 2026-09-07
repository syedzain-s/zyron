import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { authUrl, disconnect, googleConfigured, loadTokens } from '@/lib/connectors/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Google connection control.
 *
 * GET             → connection status, for the UI
 * GET ?connect=1  → start the OAuth flow
 * DELETE          → forget the account
 */

const STATE_COOKIE = 'zyron_oauth_state';

export async function GET(req: Request) {
  const url = new URL(req.url);

  if (!googleConfigured()) {
    return NextResponse.json(
      {
        connected: false,
        configured: false,
        error: 'Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      },
      { status: 200 },
    );
  }

  if (url.searchParams.get('connect')) {
    // A random state, echoed back by Google and checked on return. Without it
    // anyone could hand the user a link that connects *their* account instead.
    const state = randomBytes(16).toString('hex');
    const redirect = NextResponse.redirect(authUrl(url.origin, state));

    redirect.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      path: '/',
      maxAge: 600,
    });

    return redirect;
  }

  const tokens = await loadTokens();
  return NextResponse.json({
    connected: Boolean(tokens),
    configured: true,
    email: tokens?.email ?? null,
    connectedAt: tokens?.connectedAt ?? null,
  });
}

export async function DELETE() {
  try {
    await disconnect();
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error('[zyron] google disconnect failed', error);
    return NextResponse.json({ error: 'Could not disconnect the account.' }, { status: 503 });
  }
}
