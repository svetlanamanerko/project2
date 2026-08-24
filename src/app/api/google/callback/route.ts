import { NextRequest, NextResponse } from 'next/server';
import { hasSession } from '@/lib/auth';
import { exchangeGoogleCode, inspectGoogleDrive, saveGoogleDriveConnection } from '@/lib/google-drive';

const STATE_COOKIE = 'mu_google_oauth_state';

export async function GET(request: NextRequest) {
  const settingsUrl = new URL('/settings', request.url);
  const responseWith = (value: string) => {
    settingsUrl.searchParams.set('drive', value);
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  };

  if (!(await hasSession())) return NextResponse.redirect(new URL('/login', request.url));

  const error = request.nextUrl.searchParams.get('error');
  if (error) return responseWith('cancelled');

  const state = request.nextUrl.searchParams.get('state') || '';
  const expectedState = request.cookies.get(STATE_COOKIE)?.value || '';
  const code = request.nextUrl.searchParams.get('code') || '';
  if (!state || !expectedState || state !== expectedState || !code) return responseWith('invalid-state');

  try {
    const redirectUri = new URL('/api/google/callback', request.url).toString();
    const token = await exchangeGoogleCode(code, redirectUri);
    if (!token.refresh_token) return responseWith('no-refresh-token');

    const inspection = await inspectGoogleDrive(token.access_token!);
    await saveGoogleDriveConnection({
      refreshToken: token.refresh_token,
      accountEmail: inspection.accountEmail,
      root: inspection.root,
      childFolders: inspection.childFolders,
    });

    return responseWith(inspection.root ? 'connected' : 'connected-no-root');
  } catch (error) {
    console.error('[google-drive] OAuth callback failed:', error);
    return responseWith('error');
  }
}
