import { NextResponse } from 'next/server';
import { GoogleError, exchangeCode, saveTokens } from '@/lib/connectors/google';
import { DEFAULT_USER, getStore } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'zyron_oauth_state';

/**
 * Where Google sends the user back.
 *
 * Everything here ends in a redirect rather than JSON: the person arrives in a
 * browser tab expecting a page, and showing them a raw error object would be a
 * dead end. The reason travels as a query parameter for the UI to render.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const home = new URL('/console', url.origin);

  const error = url.searchParams.get('error');
  if (error) {
    // access_denied means they pressed cancel, which is not a failure.
    home.searchParams.set(
      'google',
      error === 'access_denied' ? 'cancelled' : 'error',
    );
    return NextResponse.redirect(home);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim().split('='))
    .find(([name]) => name === STATE_COOKIE)?.[1];

  if (!code) {
    home.searchParams.set('google', 'error');
    home.searchParams.set('reason', 'Google did not return an authorisation code.');
    return NextResponse.redirect(home);
  }

  if (!state || !expected || state !== expected) {
    home.searchParams.set('google', 'error');
    home.searchParams.set('reason', 'That sign-in did not start here. Try connecting again.');
    return NextResponse.redirect(home);
  }

  try {
    const tokens = await exchangeCode(code, url.origin);
    await saveTokens(tokens);

    // Connecting an account is exactly the kind of thing the audit trail is
    // for — it changes what the agent can see.
    await getStore()
      .appendEvent({
        userId: DEFAULT_USER,
        kind: 'google.connected',
        summary: `Google connected${tokens.email ? ` — ${tokens.email}` : ''}`,
        at: Date.now(),
      })
      .catch(() => undefined);

    home.searchParams.set('google', 'connected');
    const response = NextResponse.redirect(home);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    const message =
      err instanceof GoogleError ? err.userMessage : 'Could not finish connecting Google.';
    console.error('[zyron] google callback failed', err);

    home.searchParams.set('google', 'error');
    home.searchParams.set('reason', message);
    return NextResponse.redirect(home);
  }
}
