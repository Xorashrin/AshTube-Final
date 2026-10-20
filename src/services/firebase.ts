// Firebase project "mythtube-asraful". Web API keys are public identifiers by design;
// access is controlled by Firebase Auth and security rules, not by hiding this config.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type Persistence,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAm4-BxOof4XeDDHtbArU2jUG_sYIe1uuM',
  authDomain: 'mythtube-asraful.firebaseapp.com',
  projectId: 'mythtube-asraful',
  storageBucket: 'mythtube-asraful.firebasestorage.app',
  messagingSenderId: '374098895598',
  appId: '1:374098895598:web:10353541f974f773d049ff',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// getReactNativePersistence only exists in the React Native build of firebase/auth,
// which Metro selects at runtime; the published typings don't declare it.
type RNPersistenceFactory = (storage: typeof AsyncStorage) => Persistence;
const getRNPersistence = (FirebaseAuth as unknown as { getReactNativePersistence?: RNPersistenceFactory }).getReactNativePersistence;

function createAuth(): Auth {
  try {
    return getRNPersistence ? initializeAuth(app, { persistence: getRNPersistence(AsyncStorage) }) : getAuth(app);
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();

export interface AccountUser {
  uid: string;
  email: string;
  name: string;
}

function toAccount(user: User): AccountUser {
  const email = user.email ?? '';
  const handle = email.split('@')[0] ?? '';
  return {
    uid: user.uid,
    email,
    name: user.displayName || (handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : 'You'),
  };
}

export function watchAuth(callback: (user: AccountUser | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => callback(user ? toAccount(user) : null));
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<AccountUser> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name.trim() });
  return { ...toAccount(cred.user), name: name.trim() };
}

export async function signInWithEmail(email: string, password: string): Promise<AccountUser> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return toAccount(cred.user);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutAccount(): Promise<void> {
  await firebaseSignOut(auth);
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/missing-email': 'Please enter your email address.',
  'auth/missing-password': 'Please enter your password.',
  'auth/invalid-credential': 'Incorrect email or password. Please try again.',
  'auth/wrong-password': 'Incorrect email or password. Please try again.',
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
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}
