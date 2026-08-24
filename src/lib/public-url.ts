import 'server-only';
import type { NextRequest } from 'next/server';

export function publicOrigin(request: NextRequest) {
  const explicit = process.env.APP_PUBLIC_URL?.trim();
  if (explicit) return new URL(explicit).origin;

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto === 'https' || process.env.NODE_ENV === 'production' ? 'https' : 'http';

  if (host) return `${protocol}://${host}`;
  return new URL(request.url).origin;
}

export function publicUrl(request: NextRequest, pathname: string) {
  return new URL(pathname, `${publicOrigin(request)}/`).toString();
}
