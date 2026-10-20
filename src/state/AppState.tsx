import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { MAIN_PROFILE_ID, PROFILE_COLOR, findEpisode, getTitle, type Profile } from '../data/mock';
import { cancelDownload, deleteLocalFile, downloadKey, downloadVideo } from '../services/downloads';
import { signOutAccount, watchAuth, type AccountUser } from '../services/firebase';

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
  status: 'downloading' | 'downloaded' | 'failed';
  progress: number;
  sizeMB: number;
  localUri?: string;
  savedToDevice?: boolean;
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
  authReady: boolean;
  signedIn: boolean;
  userName: string;
  email: string;
  creditSeen: boolean;
  data: ProfileData;
  settings: Settings;
  toast: { id: number; message: string } | null;
}

type Action =
  | { type: 'HYDRATE'; saved: Partial<State> | null }
  | { type: 'AUTH'; user: AccountUser | null }
  | { type: 'SET_NAME'; name: string }
  | { type: 'CREDIT_SEEN' }
  | { type: 'TOGGLE_MY_LIST'; id: string }
  | { type: 'RATE'; id: string; rating: Rating | null }
  | { type: 'TOGGLE_REMINDER'; id: string }
  | { type: 'SET_PROGRESS'; entry: ProgressEntry }
  | { type: 'REMOVE_PROGRESS'; titleId: string }
  | { type: 'DOWNLOAD_START'; titleId: string; episodeId?: string; sizeMB: number }
  | { type: 'DOWNLOAD_PROGRESS'; titleId: string; episodeId?: string; progress: number }
  | { type: 'DOWNLOAD_DONE'; titleId: string; episodeId?: string; localUri: string; sizeMB: number; savedToDevice: boolean }
  | { type: 'DOWNLOAD_FAILED'; titleId: string; episodeId?: string }
  | { type: 'DOWNLOAD_REMOVE'; titleId: string; episodeId?: string }
  | { type: 'TOGGLE_SETTING'; key: keyof Settings }
  | { type: 'TOAST'; message: string }
  | { type: 'CLEAR_TOAST'; id: number };

const STORAGE_KEY = 'mythtube:v2';

const now = Date.now();
const starterData: ProfileData = {
  myList: ['ashen-crown', 'glass-horizon', 'hollow-pines', 'monsoon-heist', 'starfall-academy'],
  ratings: { 'neon-monsoon': 'love' },
  reminders: [],
  progress: [
    { titleId: 'ninth-oracle', episodeId: 'ninth-oracle-s1e3', position: 410, duration: 596, updatedAt: now - 1000 },
    { titleId: 'last-lantern', position: 260, duration: 653, updatedAt: now - 2000 },
    { titleId: 'neon-monsoon', episodeId: 'neon-monsoon-s2e1', position: 120, duration: 888, updatedAt: now - 3000 },
  ],
  downloads: [],
};

const initialState: State = {
  hydrated: false,
  authReady: false,
  signedIn: false,
  userName: '',
  email: '',
  creditSeen: false,
  data: starterData,
  settings: { wifiOnly: true, smartDownloads: true, notifications: true, autoplayNext: true, autoplayPreviews: true },
  toast: null,
};

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]);
const same = (d: DownloadEntry, titleId: string, episodeId?: string) => d.titleId === titleId && d.episodeId === episodeId;

function withData(state: State, fn: (d: ProfileData) => ProfileData): State {
  return { ...state, data: fn(state.data) };
}

function patchDownload(state: State, titleId: string, episodeId: string | undefined, patch: Partial<DownloadEntry>): State {
  return withData(state, (d) => ({ ...d, downloads: d.downloads.map((x) => (same(x, titleId, episodeId) ? { ...x, ...patch } : x)) }));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE': {
      const saved = action.saved ?? {};
      // Sign-in state comes from Firebase, never from local storage.
      const merged: State = { ...state, ...saved, signedIn: state.signedIn, userName: state.userName, email: state.email, authReady: state.authReady, toast: null, hydrated: true };
      // Downloads interrupted by an app restart cannot resume; mark them failed.
      merged.data = {
        ...merged.data,
        downloads: (merged.data.downloads ?? []).map((x): DownloadEntry => (x.status === 'downloading' ? { ...x, status: 'failed' } : x)),
      };
      return merged;
    }
    case 'AUTH':
      return action.user
        ? { ...state, authReady: true, signedIn: true, userName: action.user.name, email: action.user.email }
        : { ...state, authReady: true, signedIn: false, userName: '', email: '' };
    case 'SET_NAME':
      return { ...state, userName: action.name };
    case 'CREDIT_SEEN':
      return { ...state, creditSeen: true };
    case 'TOGGLE_MY_LIST':
      return withData(state, (d) => ({ ...d, myList: toggle(d.myList, action.id) }));
    case 'RATE':
      return withData(state, (d) => {
        const ratings = { ...d.ratings };
        if (action.rating) ratings[action.id] = action.rating;
        else delete ratings[action.id];
        return { ...d, ratings };
      });
    case 'TOGGLE_REMINDER':
      return withData(state, (d) => ({ ...d, reminders: toggle(d.reminders, action.id) }));
    case 'SET_PROGRESS':
      return withData(state, (d) => ({ ...d, progress: [action.entry, ...d.progress.filter((p) => p.titleId !== action.entry.titleId)] }));
    case 'REMOVE_PROGRESS':
      return withData(state, (d) => ({ ...d, progress: d.progress.filter((p) => p.titleId !== action.titleId) }));
    case 'DOWNLOAD_START':
      return withData(state, (d) => ({
        ...d,
        downloads: [
          ...d.downloads.filter((x) => !same(x, action.titleId, action.episodeId)),
          { titleId: action.titleId, episodeId: action.episodeId, status: 'downloading', progress: 0, sizeMB: action.sizeMB },
        ],
      }));
    case 'DOWNLOAD_PROGRESS':
      return patchDownload(state, action.titleId, action.episodeId, { progress: action.progress });
    case 'DOWNLOAD_DONE':
      return patchDownload(state, action.titleId, action.episodeId, {
        status: 'downloaded',
        progress: 1,
        localUri: action.localUri,
        sizeMB: action.sizeMB,
        savedToDevice: action.savedToDevice,
      });
    case 'DOWNLOAD_FAILED':
      return patchDownload(state, action.titleId, action.episodeId, { status: 'failed' });
    case 'DOWNLOAD_REMOVE':
      return withData(state, (d) => ({
        ...d,
        downloads: d.downloads.filter((x) => (action.episodeId === undefined ? x.titleId !== action.titleId : !same(x, action.titleId, action.episodeId))),
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
  setDisplayName: (name: string) => void;
  signOut: () => Promise<void>;
  markCreditSeen: () => void;
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
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'HYDRATE', saved: raw ? (JSON.parse(raw) as Partial<State>) : null }))
      .catch(() => dispatch({ type: 'HYDRATE', saved: null }));
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { creditSeen, data, settings } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ creditSeen, data, settings })).catch(() => undefined);
  }, [state]);

  useEffect(() => watchAuth((user) => dispatch({ type: 'AUTH', user })), []);

  const showToast = useCallback((message: string) => dispatch({ type: 'TOAST', message }), []);

  const startDownload = useCallback(
    (titleId: string, sizeMB: number, episodeId?: string) => {
      const title = getTitle(titleId);
      const url = episodeId ? findEpisode(title, episodeId)?.episode.video ?? title.video : title.video;
      dispatch({ type: 'DOWNLOAD_START', titleId, episodeId, sizeMB });
      let last = 0;
      downloadVideo(downloadKey(titleId, episodeId), url, (ratio) => {
        if (ratio - last >= 0.02 || ratio >= 1) {
          last = ratio;
          dispatch({ type: 'DOWNLOAD_PROGRESS', titleId, episodeId, progress: ratio });
        }
      })
        .then((r) => {
          const stillWanted = stateRef.current.data.downloads.some((x) => same(x, titleId, episodeId));
          if (!stillWanted) {
            deleteLocalFile(r.localUri);
            return;
          }
          dispatch({ type: 'DOWNLOAD_DONE', titleId, episodeId, localUri: r.localUri, sizeMB: r.sizeMB, savedToDevice: r.savedToDevice });
          showToast(r.savedToDevice ? `${title.name} saved to device storage (MythTube)` : `${title.name} downloaded`);
        })
        .catch(() => {
          if (stateRef.current.data.downloads.some((x) => same(x, titleId, episodeId))) {
            dispatch({ type: 'DOWNLOAD_FAILED', titleId, episodeId });
            showToast('Download failed. Check your connection and try again.');
          }
        });
    },
    [showToast],
  );

  const deleteDownload = useCallback((titleId: string, episodeId?: string) => {
    const targets = stateRef.current.data.downloads.filter((x) => (episodeId === undefined ? x.titleId === titleId : same(x, titleId, episodeId)));
    targets.forEach((x) => {
      cancelDownload(downloadKey(x.titleId, x.episodeId));
      deleteLocalFile(x.localUri);
    });
    dispatch({ type: 'DOWNLOAD_REMOVE', titleId, episodeId });
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const activeProfile: Profile | null = state.signedIn ? { id: MAIN_PROFILE_ID, name: state.userName || 'You', color: PROFILE_COLOR } : null;
    return {
      state,
      activeProfile,
      profileData: state.data,
      setDisplayName: (name) => dispatch({ type: 'SET_NAME', name }),
      signOut: () => signOutAccount().catch(() => undefined),
      markCreditSeen: () => dispatch({ type: 'CREDIT_SEEN' }),
      toggleMyList: (id) => dispatch({ type: 'TOGGLE_MY_LIST', id }),
      rate: (id, rating) => dispatch({ type: 'RATE', id, rating }),
      toggleReminder: (id) => dispatch({ type: 'TOGGLE_REMINDER', id }),
      setProgress: (entry) => dispatch({ type: 'SET_PROGRESS', entry }),
      removeProgress: (titleId) => dispatch({ type: 'REMOVE_PROGRESS', titleId }),
      startDownload,
      deleteDownload,
      toggleSetting: (key) => dispatch({ type: 'TOGGLE_SETTING', key }),
      showToast,
      clearToast: (id) => dispatch({ type: 'CLEAR_TOAST', id }),
    };
  }, [state, startDownload, deleteDownload, showToast]);

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
  return data.downloads.find((d) => same(d, titleId, episodeId));
}
