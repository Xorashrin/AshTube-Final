import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { findEpisode, MAIN_PROFILE_ID, PROFILE_COLOR, type Profile } from '../data/types';
import { loadSavedTitles, resolveTitle, saveTitles } from '../services/catalog';
import { cancelKey, deleteLocalFile, downloadKey, downloadTitle, isActive, type DownloadDir } from '../services/downloads';
import { GigaError } from '../services/giga';
import { setAvailabilityChecks } from '../services/availabilityStore';
import { setDataSaver, setPreferredLanguage } from '../services/playback';
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
  /** Destination file of a running or interrupted download; reused so retries resume. */
  destUri?: string;
  bytes?: number;
  speed?: number;
  server?: string;
  }

export interface ProfileData {
  myList: string[];
  ratings: Record<string, Rating>;
  reminders: string[];
  progress: ProgressEntry[];
  downloads: DownloadEntry[];
}

export type VideoQuality = 'auto' | '1080p' | '720p' | '480p';
export type DownloadQuality = '1080p' | '720p' | '480p';

export interface Settings {
  wifiOnly: boolean;
  smartDownloads: boolean;
  notifications: boolean;
  autoplayNext: boolean;
  autoplayPreviews: boolean;
  swipeGestures: boolean;
  doubleTapSeek: boolean;
  defaultStreamingQuality: VideoQuality;
  defaultDownloadQuality: DownloadQuality;
  preferredLanguage: string;
  /** Parallel connections per download (1–16). */
  downloadThreads: number;
  /** Folder chosen with the system picker; null = app storage. */
  downloadDir: DownloadDir | null;
  /** Mobile-data friendly: no background source checks or pre-warming, 720p cap while streaming. */
  dataSaver: boolean;
}

interface State {
  hydrated: boolean;
  authReady: boolean;
  signedIn: boolean;
  userName: string;
  email: string;
  creditSeen: boolean;
  profiles: Profile[];
  activeProfileId: string;
  data: ProfileData;
  settings: Settings;
  toast: { id: number; message: string } | null;
}

type Action =
  | { type: 'HYDRATE'; saved: Partial<State> | null }
  | { type: 'AUTH'; user: AccountUser | null }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SELECT_PROFILE'; id: string }
  | { type: 'CREDIT_SEEN' }
  | { type: 'TOGGLE_MY_LIST'; id: string }
  | { type: 'RATE'; id: string; rating: Rating | null }
  | { type: 'TOGGLE_REMINDER'; id: string }
  | { type: 'SET_PROGRESS'; entry: ProgressEntry }
  | { type: 'REMOVE_PROGRESS'; titleId: string }
  | { type: 'DOWNLOAD_START'; titleId: string; episodeId?: string; sizeMB: number }
  | { type: 'DOWNLOAD_PROGRESS'; titleId: string; episodeId?: string; progress: number; bytes?: number; speed?: number; server?: string }
  | { type: 'DOWNLOAD_DEST'; titleId: string; episodeId?: string; destUri: string }
  | { type: 'DOWNLOAD_DONE'; titleId: string; episodeId?: string; localUri: string; sizeMB: number }
  | { type: 'DOWNLOAD_FAILED'; titleId: string; episodeId?: string }
  | { type: 'DOWNLOAD_REMOVE'; titleId: string; episodeId?: string }
  | { type: 'TOGGLE_SETTING'; key: keyof Settings }
  | { type: 'SET_SETTING'; key: keyof Settings; value: any }
  | { type: 'TOAST'; message: string }
  | { type: 'CLEAR_TOAST'; id: number };

const STORAGE_KEY = 'mythtube:v2';

const starterData: ProfileData = {
  myList: [],
  ratings: {},
  reminders: [],
  progress: [],
  downloads: [],
};

const defaultSettings: Settings = {
  wifiOnly: true,
  smartDownloads: true,
  notifications: true,
  autoplayNext: true,
  autoplayPreviews: true,
  swipeGestures: true,
  doubleTapSeek: true,
  defaultStreamingQuality: 'auto',
  defaultDownloadQuality: '1080p',
  preferredLanguage: 'English',
  downloadThreads: 6,
  downloadDir: null,
  dataSaver: false,
};

const initialState: State = {
  hydrated: false,
  authReady: false,
  signedIn: false,
  userName: '',
  email: '',
  creditSeen: false,
  profiles: [{ id: MAIN_PROFILE_ID, name: 'You', color: PROFILE_COLOR }],
  activeProfileId: MAIN_PROFILE_ID,
  data: starterData,
  settings: defaultSettings,
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
      const merged: State = {
        ...state,
        ...saved,
        settings: { ...defaultSettings, ...(saved.settings ?? {}) },
        signedIn: state.signedIn,
        userName: state.userName,
        email: state.email,
        authReady: state.authReady,
        toast: null,
        hydrated: true,
      };
      // Downloads interrupted by an app restart cannot resume; mark them failed.
      merged.data = {
        ...merged.data,
        downloads: (merged.data.downloads ?? []).map((x): DownloadEntry => (x.status === 'downloading' ? { ...x, status: 'failed' } : x)),
      };
      return merged;
    }
    case 'AUTH': {
      const profiles = action.user
        ? state.profiles.map((p) => (p.id === MAIN_PROFILE_ID ? { ...p, name: action.user!.name || 'You' } : p))
        : state.profiles;
      return action.user
        ? { ...state, authReady: true, signedIn: true, userName: action.user.name, email: action.user.email, profiles }
        : { ...state, authReady: true, signedIn: false, userName: '', email: '' };
    }
    case 'SET_NAME':
      return {
        ...state,
        userName: action.name,
        profiles: state.profiles.map((p) => (p.id === MAIN_PROFILE_ID ? { ...p, name: action.name || 'You' } : p)),
      };
    case 'SELECT_PROFILE':
      return { ...state, activeProfileId: action.id };
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
      return patchDownload(state, action.titleId, action.episodeId, { progress: action.progress, bytes: action.bytes, speed: action.speed, ...(action.server ? { server: action.server } : {}) });
    case 'DOWNLOAD_DEST':
      return patchDownload(state, action.titleId, action.episodeId, { destUri: action.destUri });
    case 'DOWNLOAD_DONE':
      return patchDownload(state, action.titleId, action.episodeId, {
        status: 'downloaded',
        progress: 1,
        localUri: action.localUri,
        sizeMB: action.sizeMB,
        speed: 0,
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
    case 'SET_SETTING':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
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
  selectProfile: (id: string) => void;
  setDisplayName: (name: string) => void;
  signOut: () => Promise<void>;
  markCreditSeen: () => void;
  toggleMyList: (id: string) => void;
  rate: (id: string, rating: Rating | null) => void;
  toggleReminder: (id: string) => void;
  setProgress: (entry: ProgressEntry) => void;
  removeProgress: (titleId: string) => void;
  startDownload: (titleId: string, episodeId?: string, serverId?: string) => void;
  deleteDownload: (titleId: string, episodeId?: string) => void;
  toggleSetting: (key: keyof Settings) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  showToast: (message: string) => void;
  clearToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    loadSavedTitles()
      .then(() => AsyncStorage.getItem(STORAGE_KEY))
      .then((raw) => dispatch({ type: 'HYDRATE', saved: raw ? (JSON.parse(raw) as Partial<State>) : null }))
      .catch(() => dispatch({ type: 'HYDRATE', saved: null }));
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { creditSeen, data, settings, profiles, activeProfileId } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ creditSeen, data, settings, profiles, activeProfileId })).catch(() => undefined);
    saveTitles([
      ...data.myList,
      ...Object.keys(data.ratings),
      ...data.reminders,
      ...data.progress.map((p) => p.titleId),
      ...data.downloads.map((d) => d.titleId),
    ]);
  }, [state]);

  useEffect(() => {
    setPreferredLanguage(state.settings.preferredLanguage);
  }, [state.settings.preferredLanguage]);

  useEffect(() => {
    setDataSaver(state.settings.dataSaver);
    setAvailabilityChecks(!state.settings.dataSaver);
  }, [state.settings.dataSaver]);

  useEffect(() => watchAuth((user) => dispatch({ type: 'AUTH', user })), []);

  const showToast = useCallback((message: string) => dispatch({ type: 'TOAST', message }), []);

  const startDownload = useCallback(
    (titleId: string, episodeId?: string, serverId?: string) => {
      const key = downloadKey(titleId, episodeId);
      if (isActive(key)) {
        showToast('Download already in progress');
        return;
      }
      const title = resolveTitle(titleId);
      const episode = episodeId ? findEpisode(title, episodeId)?.episode : undefined;
      const previous = stateRef.current.data.downloads.find((x) => same(x, titleId, episodeId));
      const { downloadThreads, downloadDir } = stateRef.current.settings;
      dispatch({ type: 'DOWNLOAD_START', titleId, episodeId, sizeMB: 0 });
      showToast(`Finding the fastest server for ${title.name}…`);
      let lastRatio = 0;
      let lastEmit = 0;
      downloadTitle({
        key,
        title,
        episode,
        serverId,
        threads: downloadThreads,
        dir: downloadDir,
        resumeDest: previous?.destUri,
        onServer: (server) => dispatch({ type: 'DOWNLOAD_PROGRESS', titleId, episodeId, progress: lastRatio, server }),
        onDest: (destUri) => dispatch({ type: 'DOWNLOAD_DEST', titleId, episodeId, destUri }),
        onProgress: (p) => {
          const now = Date.now();
          if (now - lastEmit < 700 && p.ratio < 1) return;
          lastEmit = now;
          lastRatio = p.ratio;
          dispatch({ type: 'DOWNLOAD_PROGRESS', titleId, episodeId, progress: p.ratio, bytes: p.bytes, speed: p.speed });
        },
      })
        .then((r) => {
          const stillWanted = stateRef.current.data.downloads.some((x) => same(x, titleId, episodeId));
          if (!stillWanted) {
            deleteLocalFile(r.localUri);
            return;
          }
          dispatch({ type: 'DOWNLOAD_DONE', titleId, episodeId, localUri: r.localUri, sizeMB: r.sizeMB });
          showToast(`${title.name} is ready to watch offline`);
        })
        .catch((e) => {
          if (e instanceof GigaError && e.code === 'E_CANCELLED') return;
          if (stateRef.current.data.downloads.some((x) => same(x, titleId, episodeId))) {
            dispatch({ type: 'DOWNLOAD_FAILED', titleId, episodeId });
            showToast(e instanceof Error && e.message === 'No downloadable source' ? 'No downloadable source found for this title' : 'Download failed. Tap retry to resume.');
          }
        });
    },
    [showToast],
  );

  const deleteDownload = useCallback((titleId: string, episodeId?: string) => {
    const targets = stateRef.current.data.downloads.filter((x) => (episodeId === undefined ? x.titleId === titleId : same(x, titleId, episodeId)));
    targets.forEach((x) => {
      cancelKey(downloadKey(x.titleId, x.episodeId));
      deleteLocalFile(x.localUri);
      if (x.destUri && x.destUri !== x.localUri) deleteLocalFile(x.destUri);
    });
    dispatch({ type: 'DOWNLOAD_REMOVE', titleId, episodeId });
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const activeProfile: Profile | null = state.signedIn
      ? state.profiles.find((p) => p.id === state.activeProfileId) ??
        state.profiles[0] ?? { id: MAIN_PROFILE_ID, name: state.userName || 'You', color: PROFILE_COLOR }
      : null;
    return {
      state,
      activeProfile,
      profileData: state.data,
      selectProfile: (id) => dispatch({ type: 'SELECT_PROFILE', id }),
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
      setSetting: (key, value) => dispatch({ type: 'SET_SETTING', key, value }),
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
