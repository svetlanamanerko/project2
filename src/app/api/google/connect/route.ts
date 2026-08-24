import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { googleDriveOAuthConfigured, googleDriveScope } from '@/lib/google-drive';
import { publicUrl } from '@/lib/public-url';

const STATE_COOKIE = 'mu_google_oauth_state';

export async function GET(request: NextRequest) {
  if (!(await hasSession())) {
    return NextResponse.redirect(publicUrl(request, '/login'));
  }
  if (!googleDriveOAuthConfigured()) {
    return NextResponse.redirect(publicUrl(request, '/settings?drive=missing-config'));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const redirectUri = publicUrl(request, '/api/google/callback');
  const state = randomBytes(24).toString('base64url');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', googleDriveScope());
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
