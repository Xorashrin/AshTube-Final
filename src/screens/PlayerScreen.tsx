import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEvent, useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, type AudioTrack, type SubtitleTrack, type VideoContentFit } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Image } from '../components/Img';
import { DownloadSheet } from '../components/DownloadSheet';
import { PlayerGestures } from '../components/PlayerGestures';
import { Txt } from '../components/Txt';
import { findEpisode, nextEpisode, type Title } from '../data/types';
import { loadDetail, resolveTitle } from '../services/catalog';
import { getSearch, type Resolved, type Server, type SourceSearch } from '../services/playback';
import type { RootStackParamList } from '../navigation/types';
import { downloadFor, progressFor, useApp } from '../state/AppState';
import { colors, motion } from '../theme/tokens';
import { formatClock } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;
type Panel = 'none' | 'speed' | 'episodes' | 'audio';
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2.0];
const FIT_MODES: { mode: VideoContentFit; label: string; icon: MciName }[] = [
  { mode: 'contain', label: 'Fit Screen', icon: 'aspect-ratio' },
  { mode: 'cover', label: 'Zoom / Fill', icon: 'fullscreen' },
  { mode: 'fill', label: 'Stretch', icon: 'arrow-expand-all' },
];
const HIDE_AFTER = 4000;
const STREAM_TIMEOUT_MS = 25000;

const INJECTED_AD_SHIELD = `
  (function() {
    try {
      window.open = function() { return null; };
      window.alert = function() { return null; };
      window.confirm = function() { return false; };
      window.prompt = function() { return null; };
      window.onbeforeunload = null;
      var injectStyle = function() {
        var head = document.head || document.documentElement;
        if (!head) return;
        var style = document.createElement('style');
        style.innerHTML = 'iframe[src*="ads"], iframe[src*="adsterra"], iframe[src*="pop"], div[id*="ad-"], div[class*="ad-box"], a[target="_blank"] { display: none !important; pointer-events: none !important; } body, html { background: #000 !important; margin: 0; padding: 0; overflow: hidden; }';
        head.appendChild(style);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyle);
      } else {
        injectStyle();
      }
    } catch(e) {}
  })();
  true;
`;

function SeekBar({
  position,
  buffered,
  duration,
  onSeek,
  onScrubChange,
}: {
  position: number;
  buffered: number;
  duration: number;
  onSeek: (t: number) => void;
  onScrubChange: (t: number | null) => void;
}) {
  const width = useRef(1);
  const start = useRef(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [showTotal, setShowTotal] = useState(false);
  const currentPos = scrub ?? position;
  const ratio = duration > 0 ? Math.max(0, Math.min(1, currentPos / duration)) : 0;
  const bufferedRatio = duration > 0 && buffered > 0 ? Math.max(0, Math.min(1, buffered / duration)) : 0;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          start.current = e.nativeEvent.locationX;
          const t = Math.max(0, Math.min(1, start.current / width.current)) * duration;
          setScrub(t);
          onScrubChange(t);
        },
        onPanResponderMove: (_, g) => {
          const t = Math.max(0, Math.min(1, (start.current + g.dx) / width.current)) * duration;
          setScrub(t);
          onScrubChange(t);
        },
        onPanResponderRelease: (_, g) => {
          const t = Math.max(0, Math.min(1, (start.current + g.dx) / width.current)) * duration;
          setScrub(null);
          onScrubChange(null);
          onSeek(t);
        },
        onPanResponderTerminate: () => {
          setScrub(null);
          onScrubChange(null);
        },
      }),
    [duration, onSeek, onScrubChange],
  );

  return (
    <View style={styles.seekRow}>
      <Txt weight="medium" size={12} color={colors.textMuted} style={{ marginRight: 12, minWidth: 46 }}>
        {formatClock(Math.max(0, currentPos))}
      </Txt>
      <View
        style={styles.seekTouch}
        onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
        {...responder.panHandlers}
      >
        <View style={styles.seekTrack} pointerEvents="none">
          {bufferedRatio > 0 ? <View style={[styles.seekBuffered, { width: `${bufferedRatio * 100}%` }]} /> : null}
          <View style={[styles.seekFill, { width: `${ratio * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.seekThumb, { left: `${ratio * 100}%` }, scrub !== null ? styles.seekThumbActive : null]}
        />
      </View>
      <Pressable hitSlop={8} onPress={() => setShowTotal((v) => !v)}>
        <Txt weight="medium" size={12} color={colors.textMuted} style={{ marginLeft: 12, minWidth: 54 }} align="right">
          {showTotal
            ? formatClock(Math.max(0, duration))
            : `-${formatClock(Math.max(0, duration - currentPos))}`}
        </Txt>
      </Pressable>
    </View>
  );
}

function BottomAction({ icon, label, active, dimmed, onPress }: { icon: MciName; label: string; active?: boolean; dimmed?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.bottomAction, dimmed ? { opacity: 0.4 } : null]}>
      <MaterialCommunityIcons name={icon} size={21} color={active ? colors.blue : colors.text} />
      <Txt weight="medium" size={12} color={active ? colors.blue : colors.text} style={{ marginLeft: 6 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Next verified server that has not failed yet; waits for slower sources, then falls back to web players. */
async function nextUntried(engine: SourceSearch, failed: Set<string>, isCancelled: () => boolean): Promise<Resolved | null> {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline && !isCancelled()) {
    const next = engine.ranked().find((r) => !failed.has(r.server.id));
    if (next) return next;
    if (engine.done) {
      const embed = engine.embeds().find((s) => !failed.has(s.id));
      if (!embed) return null;
      return { server: embed, playable: { url: embed.embedUrl!, seekable: false, size: 0, host: embed.name, hls: false, embed: true }, ms: 0, score: -1 };
    }
    await sleep(350);
  }
  return null;
}

function localResolved(uri: string): Resolved {
  const server: Server = { id: 'offline', name: 'Offline • Downloaded', detail: 'stored on this device', quality: 'Offline', rank: 5, origin: 'local', kind: 'native', downloadable: false };
  return { server, playable: { url: uri, seekable: true, size: 0, host: 'Local', hls: false }, ms: 0, score: 999 };
}

export default function PlayerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { setProgress, state, showToast, profileData, startDownload, deleteDownload } = useApp();
  const [title, setTitle] = useState<Title>(() => resolveTitle(route.params.id));
  useEffect(() => {
    let cancelled = false;
    loadDetail(route.params.id).then((t) => !cancelled && setTitle(t));
    return () => {
      cancelled = true;
    };
  }, [route.params.id]);

  const found = title.kind === 'series' ? findEpisode(title, route.params.episodeId) : null;
  const episode = found?.episode;
  const next = episode ? nextEpisode(title, episode.id) : null;
  const offline = downloadFor(profileData, title.id, episode?.id);
  const offlineUri = offline?.status === 'downloaded' ? offline.localUri : undefined;
  const waitingForEpisodes = title.kind === 'series' && !title.detailed;

  // One shared engine per title/episode: it was usually warmed up already by the Title screen.
  const engine = useMemo(() => (waitingForEpisodes ? null : getSearch(title, episode)), [title.id, episode?.id, waitingForEpisodes]);
  const [, bump] = useState(0);
  useEffect(() => (engine ? engine.subscribe(() => bump((v) => v + 1)) : undefined), [engine]);

  // ---- automatic server selection with fallback
  const [current, setCurrent] = useState<Resolved | null>(null);
  const [allFailed, setAllFailed] = useState(false);
  const failedIds = useRef(new Set<string>());
  const retryToken = useRef(0);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!engine) return;
    let cancelled = false;
    failedIds.current = new Set();
    setAllFailed(false);
    if (offlineUri) {
      setCurrent(localResolved(offlineUri));
      return;
    }
    setCurrent(null);
    engine.best().then((r) => {
      if (cancelled) return;
      if (r) setCurrent(r);
      else setAllFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engine, offlineUri, token]);

  const advance = useCallback(async () => {
    if (!engine || !current) return;
    failedIds.current.add(current.server.id);
    const mine = ++retryToken.current;
    setCurrent(null);
    const nextServer = await nextUntried(engine, failedIds.current, () => mine !== retryToken.current);
    if (mine !== retryToken.current) return;
    if (nextServer) {
      showToast(`Switching to ${nextServer.server.name}`);
      setCurrent(nextServer);
    } else {
      setAllFailed(true);
    }
  }, [engine, current, showToast]);

  const choose = useCallback(
    async (server: Server) => {
      if (!engine) return;
      retryToken.current++;
      const hit = engine.results.find((r) => r.server.id === server.id);
      if (hit) return setCurrent(hit);
      if (server.kind === 'embed') return setCurrent({ server, playable: { url: server.embedUrl!, seekable: false, size: 0, host: server.name, hls: false, embed: true }, ms: 0, score: 0 });
      try {
        setCurrent(null);
        const playable = await server.resolve!();
        setCurrent({ server, playable, ms: 0, score: 0 });
      } catch {
        showToast(`${server.name} is not responding`);
        setAllFailed(true);
      }
    },
    [engine, showToast],
  );

  const isEmbed = !!current && (current.server.kind === 'embed' || !!current.playable.embed);
  const source = current && !isEmbed ? current.playable : null;

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.keepScreenOnWhilePlaying = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  const [position, setPosition] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [unlockArmed, setUnlockArmed] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fitIndex, setFitIndex] = useState(0);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [subtitleId, setSubtitleId] = useState<string | null>(null);
  const [seekHint, setSeekHint] = useState<{ side: 'back' | 'forward'; seconds: number } | null>(null);
  const volumeRef = useRef(1);
  const resumedRef = useRef(false);
  const latest = useRef({ position: 0, duration: 0 });
  const speedRef = useRef(1);
  speedRef.current = speed;

  // Load the selected source into the player.
  useEffect(() => {
    if (!source) {
      player.pause();
      return;
    }
    let cancelled = false;
    player
      .replaceAsync({ uri: source.url, headers: source.headers, contentType: source.hls ? 'hls' : 'auto' })
      .then(() => {
        if (cancelled) return;
        player.playbackRate = speedRef.current;
        player.volume = volumeRef.current;
        player.muted = muted;
        if (latest.current.position > 2) player.currentTime = latest.current.position;
        player.play();
        if (!source.seekable) showToast('This server does not support seeking');
      })
      .catch(() => {
        if (!cancelled) advance();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.url, player]);

  // Resume from saved watch progress once the first stream is ready.
  useEffect(() => {
    if (resumedRef.current || status !== 'readyToPlay' || isEmbed) return;
    resumedRef.current = true;
    const saved = progressFor(profileData, title.id);
    if (saved && (!episode || saved.episodeId === episode.id) && saved.position > 5 && (saved.duration <= 0 || saved.position < saved.duration - 15)) {
      player.currentTime = saved.position;
      setPosition(saved.position);
      latest.current.position = saved.position;
    }
  }, [status, isEmbed, profileData, title.id, episode, player]);

  useEventListener(player, 'statusChange', ({ status: s }) => {
    if (source && s === 'error') advance();
  });

  useEventListener(player, 'sourceLoad', ({ availableAudioTracks, availableSubtitleTracks }) => {
    setAudioTracks(availableAudioTracks ?? []);
    setSubtitleTracks(availableSubtitleTracks ?? []);
    setAudioId(player.audioTrack?.id ?? null);
    setSubtitleId(player.subtitleTrack?.id ?? null);
  });

  // A stream that never becomes ready within the budget is skipped.
  useEffect(() => {
    if (!source || status === 'readyToPlay') return;
    const timer = setTimeout(() => {
      if (player.status !== 'readyToPlay' && !player.playing) advance();
    }, STREAM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [source?.url, status, player, advance]);

  const seekBy = useCallback(
    (delta: number) => {
      const target = Math.max(0, Math.min(latest.current.duration || 7200, latest.current.position + delta));
      player.currentTime = target;
      setPosition(target);
      latest.current.position = target;
      const side = delta < 0 ? 'back' : 'forward';
      setSeekHint((prev) => ({ side, seconds: prev && prev.side === side ? prev.seconds + Math.abs(delta) : Math.abs(delta) }));
    },
    [player],
  );

  const seekTo = useCallback(
    (t: number) => {
      player.currentTime = t;
      setPosition(t);
      latest.current.position = t;
    },
    [player],
  );

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else {
      if (duration > 0 && position >= duration - 1) player.currentTime = 0;
      player.play();
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    player.muted = nextMuted;
  };

  const setVolume = useCallback(
    (v: number) => {
      volumeRef.current = v;
      player.volume = v;
      const mute = v <= 0.01;
      if (player.muted !== mute) {
        player.muted = mute;
        setMuted(mute);
      }
    },
    [player],
  );

  // Gesture callbacks stay stable; the gesture layer reads fresh values through these getters.
  const gestureTime = useCallback(() => latest.current, []);
  const gestureVolume = useCallback(() => volumeRef.current, []);
  const onTap = useCallback(() => setVisible((v) => !v), []);

  useEventListener(player, 'timeUpdate', ({ currentTime, bufferedPosition }) => {
    setPosition(currentTime);
    if (typeof bufferedPosition === 'number' && bufferedPosition >= 0) setBuffered(bufferedPosition);
    latest.current.position = currentTime;
    if (player.duration > 0) {
      latest.current.duration = player.duration;
      setDuration(player.duration);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (next && state.settings.autoplayNext) navigation.replace('Player', { id: title.id, episodeId: next.id });
    else setVisible(true);
  });

  // Save watch progress when leaving the player.
  useEffect(
    () => () => {
      const { position: pos, duration: dur } = latest.current;
      if (dur > 0 && pos > 5) {
        setProgress({ titleId: title.id, episodeId: episode?.id, position: pos, duration: dur, updatedAt: Date.now() });
      }
    },
    [setProgress, title.id, episode?.id],
  );

  // Auto-hide controls while playing.
  useEffect(() => {
    if (isEmbed || !visible || !isPlaying || panel !== 'none' || scrubbing !== null) return;
    const timer = setTimeout(() => setVisible(false), HIDE_AFTER);
    return () => clearTimeout(timer);
  }, [isEmbed, visible, isPlaying, panel, scrubbing, position]);

  useEffect(() => {
    if (!seekHint) return;
    const timer = setTimeout(() => setSeekHint(null), 650);
    return () => clearTimeout(timer);
  }, [seekHint]);

  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: (visible || isEmbed) && !locked ? 1 : 0, duration: motion.base, useNativeDriver: true }).start();
  }, [visible, isEmbed, locked, fade]);

  const heading = episode && found ? `${title.name} • S${found.season.number}:E${episode.number} “${episode.name}”` : title.name;
  const showSkipIntro = !isEmbed && title.kind === 'series' && position > 5 && position < 35;
  const showNext = !isEmbed && !!next && duration > 0 && duration - position < 25;
  const pointer = (visible || isEmbed) && !locked ? 'box-none' : 'none';
  const currentFit = FIT_MODES[fitIndex];
  const serverList = engine ? [...engine.servers].sort((a, b) => (engine.results.findIndex((r) => r.server.id === a.id) + 1 || 999) - (engine.results.findIndex((r) => r.server.id === b.id) + 1 || 999) || b.rank - a.rank) : [];
  const finding = !allFailed && !current;

  const handleDownloadAction = () => {
    if (offline?.status === 'downloading') {
      deleteDownload(title.id, episode?.id);
      showToast('Download cancelled');
    } else if (offline?.status === 'downloaded') {
      showToast('Already downloaded for offline playback');
    } else if (!engine?.downloadable.length && engine?.done) {
      showToast('Download is not available for this title');
    } else {
      setDownloadOpen(true);
    }
  };

  const downloadLabel = offline?.status === 'downloaded' ? 'Downloaded' : offline?.status === 'downloading' ? `${Math.round(offline.progress * 100)}%` : offline?.status === 'failed' ? 'Retry DL' : 'Download';
  const downloadIcon: MciName = offline?.status === 'downloaded' ? 'check-circle' : offline?.status === 'downloading' ? 'progress-download' : 'download-outline';
  const canDownload = !!engine && (engine.downloadable.length > 0 || !engine.done);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {isEmbed && current ? (
        <View style={StyleSheet.absoluteFill}>
          <WebView
            key={current.playable.url}
            source={{ uri: current.playable.url }}
            style={StyleSheet.absoluteFill}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            userAgent="Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            originWhitelist={['*']}
            mixedContentMode="always"
            injectedJavaScriptBeforeContentLoaded={INJECTED_AD_SHIELD}
            injectedJavaScript={INJECTED_AD_SHIELD}
            onShouldStartLoadWithRequest={(req) => {
              const u = req.url.toLowerCase();
              return !(
                u.startsWith('intent:') || u.startsWith('market:') || u.startsWith('vnd.youtube:') || u.startsWith('whatsapp:') || u.startsWith('tg:') ||
                u.includes('doubleclick.net') || u.includes('adsterra') || u.includes('popads') || u.includes('onclickads')
              );
            }}
            onError={advance}
            onHttpError={(e) => {
              if (e.nativeEvent.statusCode >= 400) advance();
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={[StyleSheet.absoluteFill, styles.webLoading]}>
                <ActivityIndicator size="large" color={colors.red} />
                <Txt size={13} color={colors.textMuted} style={{ marginTop: 10 }}>
                  Connecting to {current.server.name}…
                </Txt>
              </View>
            )}
          />
        </View>
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={currentFit.mode} surfaceType="textureView" nativeControls={false} />
      )}

      {allFailed ? (
        <View style={[StyleSheet.absoluteFill, styles.embedErrorOverlay]}>
          <MaterialCommunityIcons name="server-network-off" size={44} color={colors.red} />
          <Txt weight="bold" align="center" size={16} color={colors.text} style={{ marginTop: 12 }}>
            None of the servers could play this right now.
          </Txt>
          <Txt size={13} align="center" color={colors.textMuted} style={{ marginTop: 6 }}>
            {engine && engine.servers.length === 0 ? 'No source has this title yet.' : 'Check your connection and try again.'}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
            <Pressable onPress={() => setToken((t) => t + 1)} style={styles.primaryErrorBtn}>
              <Txt weight="bold" size={14} color="#000000">Retry</Txt>
            </Pressable>
            <Pressable onPress={() => navigation.goBack()} style={styles.secondaryErrorBtn}>
              <Txt weight="bold" size={14} color={colors.text}>Go Back</Txt>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!isEmbed ? (
        <PlayerGestures
          swipe={state.settings.swipeGestures && !locked}
          doubleTap={state.settings.doubleTapSeek && !locked}
          getTime={gestureTime}
          getVolume={gestureVolume}
          setVolume={setVolume}
          onTap={onTap}
          onSeekBy={seekBy}
          onSeekTo={seekTo}
          onScrub={setScrubbing}
        />
      ) : null}

      {!isEmbed && !allFailed && (finding || waitingForEpisodes || status === 'loading') ? (
        <View pointerEvents="none" style={styles.center}>
          <ActivityIndicator size="large" color={colors.red} />
          <Txt size={12} color={colors.textMuted} style={{ marginTop: 8 }}>
            {finding || waitingForEpisodes
              ? engine && engine.results.length > 0
                ? 'Picking the fastest server…'
                : `Finding the best source… ${engine ? `${engine.servers.length} found` : ''}`
              : 'Buffering…'}
          </Txt>
        </View>
      ) : null}

      {seekHint ? (
        <View pointerEvents="none" style={[styles.seekHint, seekHint.side === 'back' ? { left: '15%' } : { right: '15%' }]}>
          <MaterialCommunityIcons name={seekHint.side === 'back' ? 'rewind-10' : 'fast-forward-10'} size={36} color={colors.text} />
          <Txt weight="bold" size={12} style={{ marginTop: 2 }}>
            {seekHint.side === 'back' ? `-${seekHint.seconds}s` : `+${seekHint.seconds}s`}
          </Txt>
        </View>
      ) : null}

      <Animated.View pointerEvents={pointer} style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {!isEmbed ? <View pointerEvents="none" style={styles.dim} /> : null}
        <View style={[styles.top, isEmbed ? styles.topEmbedBar : null, { paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
          <Pressable hitSlop={12} onPress={() => navigation.goBack()} style={styles.iconCircle}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 14 }}>
            <Txt weight="bold" size={15} numberOfLines={1}>{heading}</Txt>
            <Txt size={11} color={colors.textMuted} numberOfLines={1}>
              {current ? `${current.server.name}${current.playable.height ? ` • ${current.playable.height}p` : ''} • auto` : 'Finding the best server…'}
            </Txt>
          </View>
          {!isEmbed ? (
            <Pressable hitSlop={10} onPress={toggleMute} style={[styles.topPill, { marginRight: 8 }]}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={colors.text} />
            </Pressable>
          ) : null}
          {title.kind === 'series' && found ? (
            <Pressable hitSlop={12} onPress={() => setPanel('episodes')} style={[styles.topPill, { marginRight: 8 }]}>
              <MaterialCommunityIcons name="cards-outline" size={16} color={colors.text} />
              <Txt weight="semibold" size={12} style={{ marginLeft: 4 }}>Episodes</Txt>
            </Pressable>
          ) : null}
          <Pressable hitSlop={12} onPress={() => setPanel('audio')} style={styles.topPill}>
            <MaterialCommunityIcons name="server-network" size={17} color={colors.text} />
            <Txt weight="semibold" size={12} style={{ marginLeft: 5 }}>Servers ({engine?.results.length ?? 0})</Txt>
          </Pressable>
        </View>

        {!isEmbed ? (
          <View style={styles.centerControls} pointerEvents="box-none">
            <Pressable hitSlop={16} onPress={() => seekBy(-10)} style={styles.transportBtn}>
              <MaterialCommunityIcons name="rewind-10" size={44} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={16} onPress={togglePlay} style={[styles.transportBtn, styles.playCenterBtn]}>
              <Ionicons
                name={duration > 0 && position >= duration - 1 ? 'refresh' : isPlaying ? 'pause' : 'play'}
                size={54}
                color={colors.text}
                style={!isPlaying && !(duration > 0 && position >= duration - 1) ? { marginLeft: 4 } : undefined}
              />
            </Pressable>
            <Pressable hitSlop={16} onPress={() => seekBy(10)} style={styles.transportBtn}>
              <MaterialCommunityIcons name="fast-forward-10" size={44} color={colors.text} />
            </Pressable>
          </View>
        ) : null}

        {!isEmbed ? (
          <View style={[styles.bottom, { paddingLeft: insets.left + 20, paddingRight: insets.right + 20, paddingBottom: Math.max(12, insets.bottom + 10) }]}>
            <SeekBar position={scrubbing ?? position} buffered={buffered} duration={duration} onSeek={seekTo} onScrubChange={setScrubbing} />
            <View style={styles.bottomActions}>
              <BottomAction icon="speedometer" label={`Speed (${speed}x)`} onPress={() => setPanel('speed')} />
              <BottomAction icon={currentFit.icon} label={currentFit.label} onPress={() => setFitIndex((fitIndex + 1) % FIT_MODES.length)} />
              <BottomAction icon="lock-open-variant-outline" label="Lock" onPress={() => { setLocked(true); setUnlockArmed(false); }} />
              <BottomAction
                icon={downloadIcon}
                label={downloadLabel}
                active={offline?.status === 'downloaded' || offline?.status === 'downloading'}
                dimmed={!canDownload && !offline}
                onPress={handleDownloadAction}
              />
              <BottomAction icon="subtitles-outline" label={subtitleId ? 'Audio & CC • On' : 'Audio & CC'} active={!!subtitleId} onPress={() => setPanel('audio')} />
              {next ? <BottomAction icon="skip-next" label="Next Ep." onPress={() => navigation.replace('Player', { id: title.id, episodeId: next.id })} /> : null}
            </View>
          </View>
        ) : null}
      </Animated.View>

      {showSkipIntro && !locked ? (
        <Pressable onPress={() => seekTo(40)} style={[styles.floating, { right: insets.right + 24 }]}>
          <Txt weight="bold" size={14}>Skip Intro</Txt>
        </Pressable>
      ) : null}
      {showNext && !locked ? (
        <Pressable onPress={() => next && navigation.replace('Player', { id: title.id, episodeId: next.id })} style={[styles.floating, styles.nextButton, { right: insets.right + 24 }]}>
          <MaterialCommunityIcons name="skip-next" size={20} color="#000000" />
          <Txt weight="bold" size={14} color="#000000" style={{ marginLeft: 6 }}>Next Episode</Txt>
        </Pressable>
      ) : null}

      {locked && visible ? (
        <View style={[styles.lockWrap, { bottom: insets.bottom + 30 }]}>
          <Pressable
            onPress={() => {
              if (unlockArmed) {
                setLocked(false);
                setUnlockArmed(false);
              } else setUnlockArmed(true);
            }}
            style={styles.lockButton}
          >
            <Ionicons name={unlockArmed ? 'lock-open' : 'lock-closed'} size={26} color={colors.text} />
          </Pressable>
          <Txt weight="semibold" size={14} style={{ marginTop: 8 }}>{unlockArmed ? 'Unlock controls?' : 'Screen Locked'}</Txt>
          <Txt size={12} color={colors.textMuted}>{unlockArmed ? 'Tap again to unlock' : 'Tap to Unlock'}</Txt>
        </View>
      ) : null}

      {panel !== 'none' ? (
        <View style={styles.panel}>
          <Pressable hitSlop={12} onPress={() => setPanel('none')} style={[styles.panelClose, { right: insets.right + 24 }]}>
            <Ionicons name="close" size={30} color={colors.text} />
          </Pressable>

          {panel === 'speed' ? (
            <View style={styles.speedWrap}>
              <Txt weight="bold" size={20} align="center" style={{ marginBottom: 40 }}>Playback Speed</Txt>
              <View style={styles.speedRow}>
                <View style={styles.speedLine} />
                {SPEEDS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => {
                      setSpeed(s);
                      player.playbackRate = s;
                      setPanel('none');
                    }}
                    style={styles.speedOption}
                  >
                    <View style={[styles.speedDot, s === speed ? styles.speedDotActive : null]} />
                    <Txt weight={s === speed ? 'bold' : 'regular'} size={14} style={{ marginTop: 14 }}>{s === 1 ? '1x (Normal)' : `${s}x`}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {panel === 'audio' ? (
            <View style={[styles.audioWrap, { paddingLeft: insets.left + 30, paddingRight: insets.right + 30 }]}>
              <View style={{ flex: 1.5, marginRight: 16 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 4 }}>Servers</Txt>
                <Txt size={11} color={colors.textDim} style={{ marginBottom: 10 }}>Best one is chosen automatically. Tap to override.</Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {serverList.map((s) => {
                    const verified = engine?.results.some((r) => r.server.id === s.id);
                    const active = current?.server.id === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setPanel('none');
                          choose(s);
                        }}
                        style={styles.audioOption}
                      >
                        <View style={{ width: 24 }}>{active ? <Ionicons name="checkmark" size={20} color={colors.red} /> : null}</View>
                        <View style={{ flex: 1 }}>
                          <Txt weight={active ? 'bold' : 'regular'} size={14} color={active ? colors.text : colors.textMuted} numberOfLines={1}>{s.name}</Txt>
                          <Txt size={11} color={colors.textDim} numberOfLines={1}>
                            {[s.size, s.detail, verified ? 'verified' : 'unchecked'].filter(Boolean).join(' • ')}
                          </Txt>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={{ flex: 1, marginRight: 16 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 14 }}>Audio Track</Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {audioTracks.length === 0 ? (
                    <Txt size={13} color={colors.textDim}>Single audio track</Txt>
                  ) : (
                    audioTracks.map((t, i) => {
                      const active = (t.id ?? String(i)) === (audioId ?? audioTracks[0].id);
                      return (
                        <Pressable
                          key={t.id ?? i}
                          onPress={() => {
                            player.audioTrack = t;
                            setAudioId(t.id ?? String(i));
                          }}
                          style={styles.audioOption}
                        >
                          <View style={{ width: 24 }}>{active ? <Ionicons name="checkmark" size={20} color={colors.red} /> : null}</View>
                          <Txt weight={active ? 'bold' : 'regular'} size={15} color={active ? colors.text : colors.textMuted}>{t.label || t.language || `Track ${i + 1}`}</Txt>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>

              <View style={{ flex: 0.9 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 14 }}>Subtitles (CC)</Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {subtitleTracks.length === 0 ? (
                    <Txt size={13} color={colors.textDim}>No subtitles in this stream</Txt>
                  ) : (
                    [{ id: null as string | null, label: 'Off', track: null as SubtitleTrack | null }, ...subtitleTracks.map((t, i) => ({ id: (t.id ?? String(i)) as string | null, label: t.label || t.language || `Track ${i + 1}`, track: t as SubtitleTrack | null }))].map((o) => {
                      const active = o.id === subtitleId;
                      return (
                        <Pressable
                          key={o.id ?? 'off'}
                          onPress={() => {
                            player.subtitleTrack = o.track;
                            setSubtitleId(o.id);
                          }}
                          style={styles.audioOption}
                        >
                          <View style={{ width: 24 }}>{active ? <Ionicons name="checkmark" size={20} color={colors.red} /> : null}</View>
                          <Txt weight={active ? 'bold' : 'regular'} size={15} color={active ? colors.text : colors.textMuted}>{o.label}</Txt>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>
          ) : null}

          {panel === 'episodes' && found ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: insets.left + 40, marginBottom: 16, gap: 12 }}>
                {title.seasons.map((s) => (
                  <Pressable
                    key={s.number}
                    onPress={() => {
                      const firstEp = s.episodes[0];
                      if (firstEp) navigation.replace('Player', { id: title.id, episodeId: firstEp.id });
                    }}
                    style={[styles.seasonChip, s.number === found.season.number ? styles.seasonChipActive : null]}
                  >
                    <Txt weight="bold" size={13} color={s.number === found.season.number ? '#000000' : colors.text}>Season {s.number}</Txt>
                  </Pressable>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: insets.left + 40, gap: 14 }}>
                {found.season.episodes.map((e) => (
                  <Pressable key={e.id} onPress={() => navigation.replace('Player', { id: title.id, episodeId: e.id })} style={{ width: 220 }}>
                    <View style={[styles.epThumb, e.id === episode?.id ? styles.epThumbActive : null]}>
                      <Image source={e.still ? { uri: e.still } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                      <View style={styles.epPlayBadge}>
                        <Ionicons name={e.id === episode?.id ? 'volume-high' : 'play'} size={16} color={colors.text} />
                      </View>
                    </View>
                    <Txt weight="semibold" size={14} numberOfLines={1} style={{ marginTop: 8 }}>{e.number}. {e.name}</Txt>
                    {e.synopsis ? (
                      <Txt size={12} color={colors.textMuted} numberOfLines={2} style={{ marginTop: 4 }}>{e.synopsis}</Txt>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      <DownloadSheet
        visible={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        title={title}
        episode={episode}
        onStart={(serverId) => startDownload(title.id, episode?.id, serverId)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { position: 'absolute', alignSelf: 'center', top: '44%', alignItems: 'center' },
  webLoading: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  embedErrorOverlay: { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.92)', padding: 24 },
  primaryErrorBtn: { backgroundColor: colors.text, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  secondaryErrorBtn: { backgroundColor: colors.red, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  top: { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10 },
  topEmbedBar: { backgroundColor: 'rgba(0,0,0,0.68)' },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  centerControls: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  transportBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCenterBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    marginHorizontal: 56,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  seekRow: { flexDirection: 'row', alignItems: 'center' },
  seekTouch: { flex: 1, height: 32, justifyContent: 'center' },
  seekTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' },
  seekBuffered: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 2 },
  seekFill: { height: 4, backgroundColor: colors.red, borderRadius: 2 },
  seekThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, backgroundColor: colors.red },
  seekThumbActive: { width: 22, height: 22, borderRadius: 11, marginLeft: -11 },
  bottomActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
  bottomAction: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  seekHint: {
    position: 'absolute',
    top: '40%',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  captionBox: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    maxWidth: '85%',
  },
  floating: {
    position: 'absolute',
    bottom: 110,
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  nextButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.text, borderColor: colors.text },
  lockWrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center' },
  lockButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  panelClose: { position: 'absolute', top: 20, zIndex: 2 },
  speedWrap: { alignItems: 'center' },
  speedRow: { flexDirection: 'row', alignItems: 'flex-start', width: '82%', justifyContent: 'space-between' },
  speedLine: { position: 'absolute', left: '8%', right: '8%', top: 11, height: 2, backgroundColor: colors.textDim },
  speedOption: { alignItems: 'center', width: 90 },
  speedDot: { width: 14, height: 14, borderRadius: 7, marginTop: 4, backgroundColor: colors.textDim },
  speedDotActive: { width: 24, height: 24, borderRadius: 12, marginTop: 0, backgroundColor: colors.red },
  audioWrap: { flex: 1, flexDirection: 'row', paddingTop: 60, paddingBottom: 30 },
  audioOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  hudBubble: {
    position: 'absolute',
    alignSelf: 'center',
    top: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 10,
  },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  seasonChipActive: { backgroundColor: colors.text },
  epThumb: {
    width: 220,
    height: 124,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  epThumbActive: { borderColor: colors.red },
  epPlayBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
