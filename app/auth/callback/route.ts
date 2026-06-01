import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveAuthError } from '@/lib/auth-error-messages';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const oauthError = searchParams.get('error_description') ?? searchParams.get('error');

  if (oauthError) {
    const { code } = resolveAuthError(oauthError, 'oauth_callback');
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(code)}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/', origin));
  }

  const redirectUrl = new URL(next, origin);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const details = resolveAuthError(error, 'oauth_callback');
    console.error(`[auth callback] ${details.code}:`, error.message);
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(details.code)}`, origin));
  }

  return response;
}
