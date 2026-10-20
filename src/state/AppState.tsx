import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';

import { PROFILES, type Profile } from '../data/mock';

export type Rating = 'down' | 'up' | 'love';

export interface ProgressEntry {
  titleId: string;
  episodeId?: string;
  position: number;
  duration: number;
  updatedAt: number;
}

export interface DownloadEntry {
  titleId: string;
  episodeId?: string;
  status: 'downloading' | 'downloaded';
  progress: number;
  sizeMB: number;
}

export interface ProfileData {
  myList: string[];
  ratings: Record<string, Rating>;
  reminders: string[];
  progress: ProgressEntry[];
  downloads: DownloadEntry[];
}

export interface Settings {
  wifiOnly: boolean;
  smartDownloads: boolean;
  notifications: boolean;
  autoplayNext: boolean;
  autoplayPreviews: boolean;
}

interface State {
  hydrated: boolean;
  signedIn: boolean;
  activeProfileId: string | null;
  profiles: Profile[];
  data: Record<string, ProfileData>;
  settings: Settings;
  toast: { id: number; message: string } | null;
}

type Action =
  | { type: 'HYDRATE'; saved: Partial<State> | null }
  | { type: 'SIGN_IN' }
  | { type: 'SIGN_OUT' }
  | { type: 'SELECT_PROFILE'; id: string }
  | { type: 'TOGGLE_MY_LIST'; id: string }
  | { type: 'RATE'; id: string; rating: Rating | null }
  | { type: 'TOGGLE_REMINDER'; id: string }
  | { type: 'SET_PROGRESS'; entry: ProgressEntry }
  | { type: 'REMOVE_PROGRESS'; titleId: string }
  | { type: 'START_DOWNLOAD'; titleId: string; episodeId?: string; sizeMB: number }
  | { type: 'DELETE_DOWNLOAD'; titleId: string; episodeId?: string }
  | { type: 'TICK_DOWNLOADS' }
  | { type: 'TOGGLE_SETTING'; key: keyof Settings }
  | { type: 'TOAST'; message: string }
  | { type: 'CLEAR_TOAST'; id: number };

const STORAGE_KEY = 'mythtube:v1';

const emptyData = (): ProfileData => ({ myList: [], ratings: {}, reminders: [], progress: [], downloads: [] });

const now = Date.now();
const seededData: Record<string, ProfileData> = {
  p1: {
    myList: ['ashen-crown', 'glass-horizon', 'hollow-pines', 'monsoon-heist', 'starfall-academy'],
    ratings: { 'neon-monsoon': 'love' },
    reminders: [],
    progress: [
      { titleId: 'ninth-oracle', episodeId: 'ninth-oracle-s1e3', position: 410, duration: 596, updatedAt: now - 1000 },
      { titleId: 'last-lantern', position: 260, duration: 653, updatedAt: now - 2000 },
      { titleId: 'neon-monsoon', episodeId: 'neon-monsoon-s2e1', position: 120, duration: 888, updatedAt: now - 3000 },
      { titleId: 'paper-tigers', episodeId: 'paper-tigers-s1e5', position: 300, duration: 734, updatedAt: now - 4000 },
    ],
    downloads: [
      { titleId: 'ashen-crown', episodeId: 'ashen-crown-s1e1', status: 'downloaded', progress: 1, sizeMB: 312 },
      { titleId: 'ashen-crown', episodeId: 'ashen-crown-s1e2', status: 'downloaded', progress: 1, sizeMB: 298 },
      { titleId: 'glass-horizon', status: 'downloaded', progress: 1, sizeMB: 845 },
    ],
  },
};

const initialState: State = {
  hydrated: false,
  signedIn: false,
  activeProfileId: null,
  profiles: PROFILES,
  data: seededData,
  settings: { wifiOnly: true, smartDownloads: true, notifications: true, autoplayNext: true, autoplayPreviews: true },
  toast: null,
};

function updateProfile(state: State, fn: (d: ProfileData) => ProfileData): State {
  const id = state.activeProfileId;
  if (!id) return state;
  return { ...state, data: { ...state.data, [id]: fn(state.data[id] ?? emptyData()) } };
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]);
const sameDownload = (d: DownloadEntry, titleId: string, episodeId?: string) => d.titleId === titleId && d.episodeId === episodeId;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...(action.saved ?? {}), profiles: PROFILES, toast: null, hydrated: true };
    case 'SIGN_IN':
      return { ...state, signedIn: true };
    case 'SIGN_OUT':
      return { ...state, signedIn: false, activeProfileId: null };
    case 'SELECT_PROFILE':
      return { ...state, activeProfileId: action.id };
    case 'TOGGLE_MY_LIST':
      return updateProfile(state, (d) => ({ ...d, myList: toggle(d.myList, action.id) }));
    case 'RATE':
      return updateProfile(state, (d) => {
        const ratings = { ...d.ratings };
        if (action.rating) ratings[action.id] = action.rating;
        else delete ratings[action.id];
        return { ...d, ratings };
      });
    case 'TOGGLE_REMINDER':
      return updateProfile(state, (d) => ({ ...d, reminders: toggle(d.reminders, action.id) }));
    case 'SET_PROGRESS':
      return updateProfile(state, (d) => ({
        ...d,
        progress: [action.entry, ...d.progress.filter((p) => p.titleId !== action.entry.titleId)],
      }));
    case 'REMOVE_PROGRESS':
      return updateProfile(state, (d) => ({ ...d, progress: d.progress.filter((p) => p.titleId !== action.titleId) }));
    case 'START_DOWNLOAD':
      return updateProfile(state, (d) =>
        d.downloads.some((x) => sameDownload(x, action.titleId, action.episodeId))
          ? d
          : { ...d, downloads: [...d.downloads, { titleId: action.titleId, episodeId: action.episodeId, status: 'downloading', progress: 0, sizeMB: action.sizeMB }] },
      );
    case 'DELETE_DOWNLOAD':
      return updateProfile(state, (d) => ({
        ...d,
        downloads: d.downloads.filter((x) =>
          action.episodeId === undefined ? x.titleId !== action.titleId : !sameDownload(x, action.titleId, action.episodeId),
        ),
      }));
    case 'TICK_DOWNLOADS':
      return updateProfile(state, (d) => ({
        ...d,
        downloads: d.downloads.map((x): DownloadEntry => {
          if (x.status !== 'downloading') return x;
          const progress = Math.min(1, x.progress + 0.07);
          return { ...x, progress, status: progress >= 1 ? 'downloaded' : 'downloading' };
        }),
      }));
    case 'TOGGLE_SETTING':
      return { ...state, settings: { ...state.settings, [action.key]: !state.settings[action.key] } };
    case 'TOAST':
      return { ...state, toast: { id: Date.now(), message: action.message } };
    case 'CLEAR_TOAST':
      return state.toast?.id === action.id ? { ...state, toast: null } : state;
    default:
      return state;
  }
}

interface AppContextValue {
  state: State;
  activeProfile: Profile | null;
  profileData: ProfileData;
  signIn: () => void;
  signOut: () => void;
  selectProfile: (id: string) => void;
  toggleMyList: (id: string) => void;
  rate: (id: string, rating: Rating | null) => void;
  toggleReminder: (id: string) => void;
  setProgress: (entry: ProgressEntry) => void;
  removeProgress: (titleId: string) => void;
  startDownload: (titleId: string, sizeMB: number, episodeId?: string) => void;
  deleteDownload: (titleId: string, episodeId?: string) => void;
  toggleSetting: (key: keyof Settings) => void;
  showToast: (message: string) => void;
  clearToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'HYDRATE', saved: raw ? (JSON.parse(raw) as Partial<State>) : null }))
      .catch(() => dispatch({ type: 'HYDRATE', saved: null }));
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { signedIn, activeProfileId, data, settings } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ signedIn, activeProfileId, data, settings })).catch(() => undefined);
  }, [state]);

  const activeData = state.activeProfileId ? state.data[state.activeProfileId] : undefined;
  const isDownloading = activeData?.downloads.some((d) => d.status === 'downloading') ?? false;
  useEffect(() => {
    if (!isDownloading) return;
    const timer = setInterval(() => dispatch({ type: 'TICK_DOWNLOADS' }), 450);
    return () => clearInterval(timer);
  }, [isDownloading]);

  const showToast = useCallback((message: string) => dispatch({ type: 'TOAST', message }), []);

  const value = useMemo<AppContextValue>(() => {
    const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
    return {
      state,
      activeProfile,
      profileData: activeData ?? emptyData(),
      signIn: () => dispatch({ type: 'SIGN_IN' }),
      signOut: () => dispatch({ type: 'SIGN_OUT' }),
      selectProfile: (id) => dispatch({ type: 'SELECT_PROFILE', id }),
      toggleMyList: (id) => dispatch({ type: 'TOGGLE_MY_LIST', id }),
      rate: (id, rating) => dispatch({ type: 'RATE', id, rating }),
      toggleReminder: (id) => dispatch({ type: 'TOGGLE_REMINDER', id }),
      setProgress: (entry) => dispatch({ type: 'SET_PROGRESS', entry }),
      removeProgress: (titleId) => dispatch({ type: 'REMOVE_PROGRESS', titleId }),
      startDownload: (titleId, sizeMB, episodeId) => dispatch({ type: 'START_DOWNLOAD', titleId, episodeId, sizeMB }),
      deleteDownload: (titleId, episodeId) => dispatch({ type: 'DELETE_DOWNLOAD', titleId, episodeId }),
      toggleSetting: (key) => dispatch({ type: 'TOGGLE_SETTING', key }),
      showToast,
      clearToast: (id) => dispatch({ type: 'CLEAR_TOAST', id }),
    };
  }, [state, activeData, showToast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}

export function progressFor(data: ProfileData, titleId: string): ProgressEntry | undefined {
  return data.progress.find((p) => p.titleId === titleId);
}

export function downloadFor(data: ProfileData, titleId: string, episodeId?: string): DownloadEntry | undefined {
  return data.downloads.find((d) => sameDownload(d, titleId, episodeId));
}
