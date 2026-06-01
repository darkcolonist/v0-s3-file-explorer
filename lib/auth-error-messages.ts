export type AuthErrorContext =
  | 'oauth_start'
  | 'oauth_callback'
  | 'session_check'
  | 'session_init';

export interface AuthErrorDetails {
  userMessage: string;
  /** Short identifier shown to the user and useful in support logs */
  code: string;
  technical?: string;
}

const KNOWN_CODE_MESSAGES: Record<string, Omit<AuthErrorDetails, 'code'>> = {
  sign_in_failed: {
    userMessage:
      'Google sign-in completed but the app could not start your session. Try again, or clear site data for this app and sign in once more.',
    technical: 'exchangeCodeForSession failed without a specific code',
  },
  pkce_verifier_missing: {
    userMessage:
      'Sign-in could not finish because the secure verification step was lost (common after redirects or an old tab). Use one browser tab, then try again.',
    technical: 'PKCE code verifier missing from storage',
  },
  invalid_grant: {
    userMessage:
      'The sign-in authorization expired or was already used. Start sign-in again from this page.',
    technical: 'invalid_grant from OAuth / Supabase',
  },
  access_denied: {
    userMessage: 'Google sign-in was cancelled. You can try again when ready.',
    technical: 'OAuth access_denied',
  },
  user_not_allowed: {
    userMessage:
      'This Google account is not allowed to use the app. Use an account that was pre-configured in Supabase Auth.',
    technical: 'User not authorized / signup disabled',
  },
  session_timeout: {
    userMessage:
      'Could not reach Supabase Auth in time. Check your network and NEXT_PUBLIC_SUPABASE_URL in .env.local, then retry.',
    technical: 'Client session lookup timed out',
  },
  network_error: {
    userMessage:
      'Network error while contacting Supabase. Verify NEXT_PUBLIC_SUPABASE_URL and that your project is reachable.',
    technical: 'fetch / network failure',
  },
  callback_exchange_failed: {
    userMessage:
      'Sign-in could not be completed after Google redirected back. See the browser console for the technical error.',
    technical: 'OAuth callback exchange failed',
  },
};

function extractMessage(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(error);
}

function sanitizeForDisplay(message: string): string {
  let s = message.trim();
  if (!s) return s;
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(s)) {
    return 'Invalid or expired session token. Try signing in again.';
  }
  if (s.length > 220) {
    s = `${s.slice(0, 220)}…`;
  }
  return s;
}

export function resolveAuthError(
  error: unknown,
  context: AuthErrorContext = 'oauth_start'
): AuthErrorDetails {
  const message = sanitizeForDisplay(extractMessage(error));
  const lower = message.toLowerCase();
  const authCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const lowerCode = authCode.toLowerCase();

  if (
    lowerCode.includes('pkce') ||
    lower.includes('pkce') ||
    lower.includes('code verifier')
  ) {
    return { code: 'pkce_verifier_missing', ...KNOWN_CODE_MESSAGES.pkce_verifier_missing, technical: message || authCode };
  }

  if (lowerCode === 'invalid_grant' || lower.includes('invalid_grant') || lower.includes('already been used')) {
    return { code: 'invalid_grant', ...KNOWN_CODE_MESSAGES.invalid_grant, technical: message || authCode };
  }

  if (lower.includes('access_denied') || lowerCode === 'access_denied') {
    return { code: 'access_denied', ...KNOWN_CODE_MESSAGES.access_denied, technical: message };
  }

  if (
    lower.includes('signup') ||
    lower.includes('not authorized') ||
    lower.includes('email not confirmed') ||
    lower.includes('user_banned')
  ) {
    return { code: 'user_not_allowed', ...KNOWN_CODE_MESSAGES.user_not_allowed, technical: message };
  }

  if (lower.includes('session lookup timed out')) {
    return { code: 'session_timeout', ...KNOWN_CODE_MESSAGES.session_timeout, technical: message };
  }

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network error')) {
    return { code: 'network_error', ...KNOWN_CODE_MESSAGES.network_error, technical: message };
  }

  if (context === 'oauth_callback' && !message) {
    return { code: 'sign_in_failed', ...KNOWN_CODE_MESSAGES.sign_in_failed };
  }

  if (context === 'oauth_callback') {
    return {
      code: 'callback_exchange_failed',
      userMessage: `Sign-in could not be completed after redirect. ${message}`,
      technical: message,
    };
  }

  return {
    code: lowerCode || 'auth_error',
    userMessage: message
      ? `Sign-in failed: ${message}`
      : 'Sign-in failed for an unknown reason. Check the browser console and Supabase Auth logs.',
    technical: message || authCode,
  };
}

export function formatAuthErrorToast(details: AuthErrorDetails): string {
  return `${details.userMessage} (${details.code})`;
}

export function logAuthError(details: AuthErrorDetails, raw?: unknown): void {
  console.error(`[auth:${details.code}]`, details.technical ?? raw);
}

/** Resolve ?auth_error= query values (short codes or encoded provider messages). */
export function authErrorFromQueryParam(param: string | null): AuthErrorDetails | null {
  if (!param) return null;

  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    decoded = param;
  }

  const known = KNOWN_CODE_MESSAGES[decoded];
  if (known) {
    return { code: decoded, ...known };
  }

  return resolveAuthError(decoded, 'oauth_callback');
}
