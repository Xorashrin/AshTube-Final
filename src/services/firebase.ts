// Firebase Authentication through the Identity Toolkit REST API (project "mythtube-asraful").
// Web API keys are public identifiers by design; access is controlled by Firebase Auth rules.
// Using REST instead of the Firebase JS SDK keeps roughly a megabyte out of the app bundle.
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY = 'AIzaSyAm4-BxOof4XeDDHtbArU2jUG_sYIe1uuM';
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
const SESSION_KEY = 'mythtube:auth:v1';

export interface AccountUser {
  uid: string;
  email: string;
  name: string;
}

interface Session extends AccountUser {
  refreshToken: string;
}

class AuthError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type Listener = (user: AccountUser | null) => void;
const listeners = new Set<Listener>();
let current: Session | null = null;
let restored = false;

function publicUser(s: Session | null): AccountUser | null {
  return s ? { uid: s.uid, email: s.email, name: s.name } : null;
}

function emit() {
  const user = publicUser(current);
  listeners.forEach((l) => l(user));
}

async function persist(session: Session | null) {
  current = session;
  if (session) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => undefined);
  else await AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
  emit();
}

function displayName(name: string | undefined, email: string): string {
  if (name) return name;
  const handle = email.split('@')[0] ?? '';
  return handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : 'You';
}

/** Maps Identity Toolkit messages (e.g. "WEAK_PASSWORD : …") to the auth/* codes the UI understands. */
const CODES: Record<string, string> = {
  EMAIL_EXISTS: 'auth/email-already-in-use',
  INVALID_EMAIL: 'auth/invalid-email',
  MISSING_EMAIL: 'auth/missing-email',
  MISSING_PASSWORD: 'auth/missing-password',
  WEAK_PASSWORD: 'auth/weak-password',
  INVALID_PASSWORD: 'auth/invalid-credential',
  INVALID_LOGIN_CREDENTIALS: 'auth/invalid-credential',
  EMAIL_NOT_FOUND: 'auth/user-not-found',
  USER_DISABLED: 'auth/user-disabled',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
  OPERATION_NOT_ALLOWED: 'auth/operation-not-allowed',
  CONFIGURATION_NOT_FOUND: 'auth/configuration-not-found',
};

async function call<T>(url: string, body: BodyInit, contentType = 'application/json'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  } catch {
    throw new AuthError('auth/network-request-failed');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) {
    const key = (data.error?.message ?? '').split(/[\s:]/)[0];
    throw new AuthError(CODES[key] ?? key ?? 'auth/unknown');
  }
  return data;
}

interface TokenResponse {
  idToken: string;
  refreshToken: string;
  localId: string;
  email?: string;
  displayName?: string;
}

async function setName(idToken: string, name: string) {
  await call(`${IDENTITY}/accounts:update?key=${API_KEY}`, JSON.stringify({ idToken, displayName: name, returnSecureToken: false })).catch(() => undefined);
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<AccountUser> {
  const r = await call<TokenResponse>(`${IDENTITY}/accounts:signUp?key=${API_KEY}`, JSON.stringify({ email: email.trim(), password, returnSecureToken: true }));
  await setName(r.idToken, name.trim());
  const session: Session = { uid: r.localId, email: email.trim(), name: displayName(name.trim(), email), refreshToken: r.refreshToken };
  await persist(session);
  return publicUser(session)!;
}

export async function signInWithEmail(email: string, password: string): Promise<AccountUser> {
  const r = await call<TokenResponse>(`${IDENTITY}/accounts:signInWithPassword?key=${API_KEY}`, JSON.stringify({ email: email.trim(), password, returnSecureToken: true }));
  const session: Session = { uid: r.localId, email: r.email ?? email.trim(), name: displayName(r.displayName, r.email ?? email), refreshToken: r.refreshToken };
  await persist(session);
  return publicUser(session)!;
}

export async function resetPassword(email: string): Promise<void> {
  await call(`${IDENTITY}/accounts:sendOobCode?key=${API_KEY}`, JSON.stringify({ requestType: 'PASSWORD_RESET', email: email.trim() }));
}

export async function signOutAccount(): Promise<void> {
  await persist(null);
}

/** Restores the stored session and verifies it in the background. Offline starts stay signed in. */
async function restore() {
  restored = true;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    current = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    current = null;
  }
  emit();
  if (!current) return;
  const stored = current;
  try {
    const r = await call<{ refresh_token: string; user_id: string }>(
      `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,
      `grant_type=refresh_token&refresh_token=${encodeURIComponent(stored.refreshToken)}`,
      'application/x-www-form-urlencoded',
    );
    if (current?.uid === stored.uid) await persist({ ...stored, refreshToken: r.refresh_token });
  } catch (e) {
    const code = e instanceof AuthError ? e.code : '';
    if (code !== 'auth/network-request-failed' && /TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED|INVALID_REFRESH_TOKEN|user-disabled/i.test(code + ' ' + (e instanceof Error ? e.message : ''))) {
      await persist(null);
    }
  }
}

export function watchAuth(callback: Listener): () => void {
  listeners.add(callback);
  if (!restored) restore();
  else callback(publicUser(current));
  return () => listeners.delete(callback);
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/missing-email': 'Please enter your email address.',
  'auth/missing-password': 'Please enter your password.',
  'auth/invalid-credential': 'Incorrect email or password. Please try again.',
  'auth/user-not-found': "We can't find an account with this email address.",
  'auth/user-disabled': 'This account has been disabled.',
  'auth/email-already-in-use': 'Looks like that account already exists. Sign in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': "Can't connect. Check your internet connection and try again.",
  'auth/operation-not-allowed': 'Email sign-in is not enabled for this app yet.',
  'auth/configuration-not-found': 'Email sign-in is not enabled for this app yet.',
};

export function authErrorMessage(error: unknown): string {
  const code = error instanceof AuthError ? error.code : '';
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}
