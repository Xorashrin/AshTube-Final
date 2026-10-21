import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEvent, useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Txt } from '../components/Txt';
import { img } from '../data/images';
import { findEpisode, nextEpisode } from '../data/mock';
import { resolveTitle } from '../data/resolveTitle';
import {
  buildNuvioStreams,
  isYoutubeOrTrailerStream,
  pickDirectMp4Url,
  type StreamSource,
} from '../services/providers/nuvioProviders';
import type { RootStackParamList } from '../navigation/types';
import { downloadFor, progressFor, useApp } from '../state/AppState';
import { colors, motion } from '../theme/tokens';
import { formatClock } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;
type Panel = 'none' | 'speed' | 'episodes' | 'audio';
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2.0];
const AUDIO = ['English [Original]', 'Bangla', 'Hindi', 'Spanish'];
const SUBTITLES = ['Off', 'English', 'English [CC]', 'Bangla', 'Hindi'];
const FIT_MODES: { mode: VideoContentFit; label: string; icon: MciName }[] = [
  { mode: 'contain', label: 'Fit Screen', icon: 'aspect-ratio' },
  { mode: 'cover', label: 'Zoom / Fill', icon: 'fullscreen' },
  { mode: 'fill', label: 'Stretch', icon: 'arrow-expand-all' },
];
const HIDE_AFTER = 4000;
const STREAM_TIMEOUT_MS = 16000;

const SAMPLE_CAPTIONS: Record<string, string[]> = {
  English: [
    'Every choice we make leaves an echo across time.',
    'Stay sharp — they know we are already inside the perimeter.',
    'Look at the horizon. The signal is coming from the northern tower.',
    'We only get one shot at this. Make every second count.',
  ],
  'English [CC]': [
    '[atmospheric synth music playing]',
    'Every choice we make leaves an echo across time.',
    '[distant rumble] Stay sharp — they know we are here.',
    '[radio static] The signal is coming from the northern tower.',
  ],
  Bangla: [
    'আমাদের প্রতিটি সিদ্ধান্তের প্রতিধ্বনি সময়ের সাথে থেকে যায়।',
    'সতর্ক থাকো — তারা জানে আমরা ভেতরে ঢুকে পড়েছি।',
    'দিগন্তের দিকে তাকাও, উত্তর টাওয়ার থেকে সিগন্যাল আসছে।',
    'আমাদের হাতে একটাই সুযোগ আছে, প্রতিটি মুহূর্ত কাজে লাগাও।',
  ],
  Hindi: [
    'हमारा हर फैसला वक्त के साथ अपनी गूंज छोड़ जाता है।',
    'सावधान रहो — उन्हें पता है कि हम अंदर आ चुके हैं।',
    'क्षितिज की तरफ देखो, सिग्नल उत्तरी टावर से आ रहा है।',
    'हमारे पास सिर्फ एक मौका है, हर सेकंड मायने रखता है।',
  ],
};

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

function BottomAction({ icon, label, active, onPress }: { icon: MciName; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.bottomAction}>
      <MaterialCommunityIcons name={icon} size={21} color={active ? colors.blue : colors.text} />
      <Txt weight="medium" size={12} color={active ? colors.blue : colors.text} style={{ marginLeft: 6 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export default function PlayerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { setProgress, state, showToast, profileData, startDownload, deleteDownload } = useApp();
  const title = resolveTitle(route.params.id);
  const found = title.kind === 'series' ? findEpisode(title, route.params.episodeId) : null;
  const episode = found?.episode;
  const next = episode ? nextEpisode(title, episode.id) : null;
  const offline = downloadFor(profileData, title.id, episode?.id);

  const streams = useMemo<StreamSource[]>(() => {
    const list: StreamSource[] = [];
    if (offline?.status === 'downloaded' && offline.localUri) {
      list.push({
        id: 'offline-local',
        name: 'Offline Storage • Downloaded MP4',
        url: offline.localUri,
        kind: 'mp4',
        quality: 'Offline HD',
        language: 'Local',
        isDirect: true,
      });
    }

    if (title.kind === 'series' && found && episode) {
      if (episode.video && /\.(mp4|m3u8)(\?|$)/i.test(episode.video)) {
        list.push({
          id: `ep-direct-${episode.id}`,
          name: 'Server 1 • Episode Direct HD (Native)',
          url: episode.video,
          kind: episode.video.includes('.m3u8') ? 'hls' : 'mp4',
          quality: '1080p',
          language: 'Multi-Audio',
          isDirect: true,
        });
      }
      const epStreams = buildNuvioStreams({
        id: title.id,
        kind: 'series',
        season: found.season?.number ?? 1,
        episode: episode?.number ?? 1,
      });
      epStreams.forEach((s) => {
        if (!list.some((x) => x.url === s.url) && !isYoutubeOrTrailerStream(s)) {
          list.push(s);
        }
      });
    } else {
      const rawStreams = (title.streams ?? []).filter((s) => !isYoutubeOrTrailerStream(s));
      if (rawStreams.length > 0) {
        rawStreams.forEach((s, idx) => {
          if (!list.some((x) => x.url === s.url)) {
            list.push({
              id: (s as Partial<StreamSource>).id ?? `stream-${idx}`,
              name: s.name,
              url: s.url,
              kind: (s.kind as StreamSource['kind']) || 'mp4',
              quality: (s as Partial<StreamSource>).quality ?? '1080p',
              language: (s as Partial<StreamSource>).language ?? 'Multi-Audio',
              isDirect: s.kind === 'mp4' || s.kind === 'hls',
            });
          }
        });
      }
      if (!list.some((s) => s.kind === 'mp4' || s.kind === 'hls')) {
        const directFallback =
          title.video && /\.(mp4|m3u8)(\?|$)/i.test(title.video)
            ? title.video
            : pickDirectMp4Url(episode?.id ?? title.id, 0);
        list.unshift({
          id: 'direct-fallback-mp4',
          name: 'Server 1 • Direct HD (Native Player)',
          url: directFallback,
          kind: directFallback.includes('.m3u8') ? 'hls' : 'mp4',
          quality: '1080p',
          language: 'Multi-Audio',
          isDirect: true,
        });
      }
    }
    return list;
  }, [offline, title, found, episode]);

  const [streamIndex, setStreamIndex] = useState(0);
  const [embedFailed, setEmbedFailed] = useState(false);
  const currentStream = streams[streamIndex] ?? streams[0];
  const isEmbed = Boolean(currentStream && currentStream.kind === 'embed');
  const nativeSourceUrl = !isEmbed && currentStream?.url ? currentStream.url : null;

  const player = useVideoPlayer(nativeSourceUrl, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.keepScreenOnWhilePlaying = true;
    p.play();
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
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fitIndex, setFitIndex] = useState(0);
  const [audio, setAudio] = useState(state.settings.preferredLanguage || AUDIO[0]);
  const [subtitle, setSubtitle] = useState(SUBTITLES[0]);
  const [seekHint, setSeekHint] = useState<{ side: 'back' | 'forward'; seconds: number } | null>(null);
  const [brightness, setBrightness] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [gestureHUD, setGestureHUD] = useState<{ icon: MciName; text: string } | null>(null);
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumedRef = useRef(false);
  const lastLoadedUrlRef = useRef<string | null>(nativeSourceUrl);

  const showHUD = useCallback((icon: MciName, text: string) => {
    setGestureHUD({ icon, text });
    if (gestureTimer.current) clearTimeout(gestureTimer.current);
    gestureTimer.current = setTimeout(() => setGestureHUD(null), 1300);
  }, []);

  // Dynamically replace video source in expo-video whenever user switches servers or offline file finishes
  useEffect(() => {
    if (!nativeSourceUrl) {
      player.pause();
      lastLoadedUrlRef.current = null;
      return;
    }
    if (lastLoadedUrlRef.current === nativeSourceUrl) return;
    lastLoadedUrlRef.current = nativeSourceUrl;
    player
      .replaceAsync(nativeSourceUrl)
      .then(() => {
        player.playbackRate = speed;
        player.volume = muted ? 0 : volume;
        if (latest.current.position > 2) {
          player.currentTime = latest.current.position;
        }
        player.play();
      })
      .catch(() => undefined);
  }, [nativeSourceUrl, player, speed, muted, volume]);

  // Resume from saved watch progress once when player becomes ready
  useEffect(() => {
    if (resumedRef.current || status !== 'readyToPlay' || isEmbed) return;
    resumedRef.current = true;
    const saved = progressFor(profileData, title.id);
    if (
      saved &&
      (!episode || saved.episodeId === episode.id) &&
      saved.position > 5 &&
      (saved.duration <= 0 || saved.position < saved.duration - 15)
    ) {
      player.currentTime = saved.position;
      setPosition(saved.position);
      showHUD('history', `Resumed at ${formatClock(saved.position)}`);
    }
  }, [status, isEmbed, profileData, title.id, episode, player, showHUD]);

  // Auto-failover to next stream if current native stream errors or times out
  const tryNextStream = useCallback(() => {
    setStreamIndex((prev) => {
      if (prev + 1 < streams.length) {
        const nextStream = streams[prev + 1];
        showToast(`Switching to ${nextStream.name}`);
        return prev + 1;
      }
      setEmbedFailed(true);
      return prev;
    });
  }, [streams, showToast]);

  useEventListener(player, 'statusChange', ({ status: s }) => {
    if (!isEmbed && s === 'error') {
      tryNextStream();
    }
  });

  useEffect(() => {
    if (isEmbed || status === 'readyToPlay' || embedFailed) return;
    const timer = setTimeout(() => {
      if (player.status !== 'readyToPlay' && !player.playing) {
        tryNextStream();
      }
    }, STREAM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isEmbed, status, streamIndex, embedFailed, player, tryNextStream]);

  const screenWidth = useRef(1);
  const screenHeight = useRef(1);
  const startY = useRef(0);
  const startX = useRef(0);
  const startVal = useRef(0);
  const startPos = useRef(0);
  const isLeft = useRef(false);
  const gestureMode = useRef<'none' | 'vertical' | 'horizontal'>('none');

  const latest = useRef({ position: 0, duration: 0 });
  const lastTap = useRef<{ side: 'left' | 'right'; at: number } | null>(null);

  const seekBy = useCallback(
    (delta: number) => {
      const target = Math.max(0, Math.min(latest.current.duration || 7200, latest.current.position + delta));
      player.currentTime = target;
      setPosition(target);
      latest.current.position = target;
      const side = delta < 0 ? 'back' : 'forward';
      setSeekHint((prev) => ({
        side,
        seconds: prev && prev.side === side ? prev.seconds + Math.abs(delta) : Math.abs(delta),
      }));
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
    if (isPlaying) {
      player.pause();
    } else {
      if (duration > 0 && position >= duration - 1) {
        player.currentTime = 0;
      }
      player.play();
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    player.muted = nextMuted;
    showHUD(nextMuted ? 'volume-off' : 'volume-high', nextMuted ? 'Muted' : `Volume ${Math.round(volume * 100)}%`);
  };

  const cycleFitMode = () => {
    const nextIdx = (fitIndex + 1) % FIT_MODES.length;
    setFitIndex(nextIdx);
    showHUD(FIT_MODES[nextIdx].icon, `Display: ${FIT_MODES[nextIdx].label}`);
  };

  const onSurfacePress = (side: 'left' | 'right') => {
    if (locked) {
      setVisible((v) => !v);
      return;
    }
    const nowMs = Date.now();
    if (
      state.settings.doubleTapSeek &&
      lastTap.current &&
      lastTap.current.side === side &&
      nowMs - lastTap.current.at < 320
    ) {
      seekBy(side === 'left' ? -10 : 10);
      lastTap.current = { side, at: nowMs };
      return;
    }
    lastTap.current = { side, at: nowMs };
    setVisible((v) => !v);
  };

  const surfaceResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isEmbed,
        onMoveShouldSetPanResponder: (_, g) =>
          !isEmbed && !locked && (Math.abs(g.dy) > 12 || Math.abs(g.dx) > 12),
        onPanResponderGrant: (e) => {
          startY.current = e.nativeEvent.pageY;
          startX.current = e.nativeEvent.pageX;
          isLeft.current = startX.current < screenWidth.current / 2;
          startVal.current = isLeft.current ? brightness : volume;
          startPos.current = latest.current.position;
          gestureMode.current = 'none';
        },
        onPanResponderMove: (_, g) => {
          if (!state.settings.swipeGestures || locked || isEmbed) return;
          if (gestureMode.current === 'none') {
            if (Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 16) {
              gestureMode.current = 'horizontal';
            } else if (Math.abs(g.dy) > 14) {
              gestureMode.current = 'vertical';
            } else {
              return;
            }
          }

          if (gestureMode.current === 'horizontal' && latest.current.duration > 0) {
            const deltaSec = Math.round((g.dx / Math.max(1, screenWidth.current)) * 120);
            const target = Math.max(0, Math.min(latest.current.duration, startPos.current + deltaSec));
            setScrubbing(target);
            const sign = deltaSec >= 0 ? `+${deltaSec}s` : `${deltaSec}s`;
            showHUD(deltaSec >= 0 ? 'fast-forward' : 'rewind', `${formatClock(target)} (${sign})`);
            return;
          }

          if (gestureMode.current === 'vertical') {
            const delta = -g.dy / (screenHeight.current * 0.75);
            const newVal = Math.max(0.05, Math.min(1.0, startVal.current + delta));
            if (isLeft.current) {
              setBrightness(Math.max(0.15, newVal));
              showHUD('weather-sunny', `Brightness ${Math.round(Math.max(0.15, newVal) * 100)}%`);
            } else {
              const vol = newVal <= 0.06 ? 0 : newVal;
              setVolume(vol);
              setMuted(vol === 0);
              player.muted = vol === 0;
              player.volume = vol;
              showHUD(vol === 0 ? 'volume-mute' : 'volume-high', `Volume ${Math.round(vol * 100)}%`);
            }
          }
        },
        onPanResponderRelease: (e, g) => {
          if (gestureMode.current === 'horizontal' && latest.current.duration > 0) {
            const deltaSec = Math.round((g.dx / Math.max(1, screenWidth.current)) * 120);
            const target = Math.max(0, Math.min(latest.current.duration, startPos.current + deltaSec));
            setScrubbing(null);
            seekTo(target);
            gestureMode.current = 'none';
            return;
          }
          gestureMode.current = 'none';
          if (Math.abs(g.dx) < 12 && Math.abs(g.dy) < 12) {
            const touchX = e.nativeEvent.pageX;
            onSurfacePress(touchX < screenWidth.current / 2 ? 'left' : 'right');
          }
        },
        onPanResponderTerminate: () => {
          gestureMode.current = 'none';
          setScrubbing(null);
        },
      }),
    [locked, brightness, volume, state.settings.swipeGestures, player, isEmbed, seekTo, showHUD],
  );

  useEventListener(player, 'timeUpdate', ({ currentTime, bufferedPosition }) => {
    setPosition(currentTime);
    if (typeof bufferedPosition === 'number' && bufferedPosition >= 0) {
      setBuffered(bufferedPosition);
    }
    latest.current.position = currentTime;
    if (player.duration > 0) {
      latest.current.duration = player.duration;
      setDuration(player.duration);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (next && state.settings.autoplayNext) {
      navigation.replace('Player', { id: title.id, episodeId: next.id });
    } else {
      setVisible(true);
    }
  });

  // Save watch progress when leaving the player.
  useEffect(
    () => () => {
      const { position: pos, duration: dur } = latest.current;
      if (dur > 0 && pos > 5) {
        setProgress({
          titleId: title.id,
          episodeId: episode?.id,
          position: pos,
          duration: dur,
          updatedAt: Date.now(),
        });
      }
    },
    [setProgress, title.id, episode?.id],
  );

  // Auto-hide controls while playing in native mode.
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

  const fade = useSharedValue(1);
  useEffect(() => {
    fade.value = withTiming((visible || isEmbed) && !locked ? 1 : 0, { duration: motion.base });
  }, [visible, isEmbed, locked, fade]);
  const controlsStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const heading =
    episode && found
      ? `${title.name} • S${found.season.number}:E${episode.number} “${episode.name}”`
      : title.name;
  const showSkipIntro = !isEmbed && title.kind === 'series' && position > 5 && position < 35;
  const showNext = !isEmbed && !!next && duration > 0 && duration - position < 25;
  const pointer = (visible || isEmbed) && !locked ? 'box-none' : 'none';
  const currentFit = FIT_MODES[fitIndex];

  // Active subtitle cue when subtitles are enabled
  const activeCaption = useMemo(() => {
    if (isEmbed || subtitle === 'Off') return null;
    const pool = SAMPLE_CAPTIONS[subtitle] ?? SAMPLE_CAPTIONS.English;
    const idx = Math.floor(position / 6) % pool.length;
    return pool[idx];
  }, [isEmbed, subtitle, position]);

  const handleDownloadAction = () => {
    if (offline?.status === 'downloading') {
      deleteDownload(title.id, episode?.id);
      showToast('Download cancelled');
      return;
    }
    if (offline?.status === 'downloaded') {
      showToast('Already downloaded for offline playback');
      return;
    }
    startDownload(title.id, episode ? episode.runtime * 6 : 845, episode?.id);
  };

  const downloadLabel =
    offline?.status === 'downloaded'
      ? 'Downloaded'
      : offline?.status === 'downloading'
        ? `${Math.round(offline.progress * 100)}%`
        : offline?.status === 'failed'
          ? 'Retry DL'
          : 'Download';

  const downloadIcon: MciName =
    offline?.status === 'downloaded'
      ? 'check-circle'
      : offline?.status === 'downloading'
        ? 'progress-download'
        : 'download-outline';

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {isEmbed && currentStream?.url ? (
        <View style={StyleSheet.absoluteFill}>
          <WebView
            key={currentStream.url}
            source={{ uri: currentStream.url }}
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
              if (
                u.startsWith('intent:') ||
                u.startsWith('market:') ||
                u.startsWith('vnd.youtube:') ||
                u.startsWith('whatsapp:') ||
                u.startsWith('tg:') ||
                u.includes('doubleclick.net') ||
                u.includes('adsterra') ||
                u.includes('popads') ||
                u.includes('onclickads')
              ) {
                return false;
              }
              return true;
            }}
            onError={tryNextStream}
            onHttpError={(e) => {
              if (e.nativeEvent.statusCode >= 400) {
                tryNextStream();
              }
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={[StyleSheet.absoluteFill, styles.webLoading]}>
                <ActivityIndicator size="large" color={colors.red} />
                <Txt size={13} color={colors.textMuted} style={{ marginTop: 10 }}>
                  Connecting to {currentStream.name}…
                </Txt>
              </View>
            )}
          />
          {embedFailed ? (
            <View style={[StyleSheet.absoluteFill, styles.embedErrorOverlay]}>
              <MaterialCommunityIcons name="server-network-off" size={44} color={colors.red} />
              <Txt weight="bold" align="center" size={16} color={colors.text} style={{ marginTop: 12 }}>
                This embed server is currently unavailable.
              </Txt>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
                <Pressable
                  onPress={() => {
                    setStreamIndex(0);
                    setEmbedFailed(false);
                    showToast('Switched to Native Direct Player');
                  }}
                  style={styles.primaryErrorBtn}
                >
                  <Txt weight="bold" size={14} color="#000000">
                    Use Native Player
                  </Txt>
                </Pressable>
                <Pressable onPress={() => setPanel('audio')} style={styles.secondaryErrorBtn}>
                  <Txt weight="bold" size={14} color={colors.text}>
                    Choose Server
                  </Txt>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={currentFit.mode}
          surfaceType="textureView"
          nativeControls={false}
        />
      )}

      {/* Dimmer overlay for swipe brightness control */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: (1 - brightness) * 0.82 }]}
      />

      {/* Subtitle / CC Overlay */}
      {activeCaption ? (
        <View pointerEvents="none" style={[styles.captionWrap, { bottom: visible ? 108 : 34 }]}>
          <View style={styles.captionBox}>
            <Txt weight="semibold" size={15} align="center" color="#FFFFFF">
              {activeCaption}
            </Txt>
          </View>
        </View>
      ) : null}

      {/* Gesture surface tracking touches & swipes ONLY in native player mode so WebView touches are never blocked */}
      {!isEmbed ? (
        <View
          style={StyleSheet.absoluteFill}
          onLayout={(e) => {
            screenWidth.current = Math.max(1, e.nativeEvent.layout.width);
            screenHeight.current = Math.max(1, e.nativeEvent.layout.height);
          }}
          {...surfaceResponder.panHandlers}
        />
      ) : null}

      {!isEmbed && status === 'loading' ? (
        <View pointerEvents="none" style={styles.center}>
          <ActivityIndicator size="large" color={colors.red} />
          <Txt size={12} color={colors.textMuted} style={{ marginTop: 8 }}>
            Loading {currentStream?.quality || 'HD'} stream…
          </Txt>
        </View>
      ) : null}

      {gestureHUD ? (
        <View pointerEvents="none" style={styles.hudBubble}>
          <MaterialCommunityIcons name={gestureHUD.icon} size={22} color={colors.text} />
          <Txt weight="bold" size={14} style={{ marginLeft: 8 }}>
            {gestureHUD.text}
          </Txt>
        </View>
      ) : null}

      {seekHint ? (
        <View pointerEvents="none" style={[styles.seekHint, seekHint.side === 'back' ? { left: '15%' } : { right: '15%' }]}>
          <MaterialCommunityIcons
            name={seekHint.side === 'back' ? 'rewind-10' : 'fast-forward-10'}
            size={36}
            color={colors.text}
          />
          <Txt weight="bold" size={12} style={{ marginTop: 2 }}>
            {seekHint.side === 'back' ? `-${seekHint.seconds}s` : `+${seekHint.seconds}s`}
          </Txt>
        </View>
      ) : null}

      <Animated.View pointerEvents={pointer} style={[StyleSheet.absoluteFill, controlsStyle]}>
        {!isEmbed ? <View pointerEvents="none" style={styles.dim} /> : null}
        <View
          style={[
            styles.top,
            isEmbed ? styles.topEmbedBar : null,
            { paddingLeft: insets.left + 20, paddingRight: insets.right + 20 },
          ]}
        >
          <Pressable hitSlop={12} onPress={() => navigation.goBack()} style={styles.iconCircle}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 14 }}>
            <Txt weight="bold" size={15} numberOfLines={1}>
              {heading}
            </Txt>
            <Txt size={11} color={colors.textMuted} numberOfLines={1}>
              {currentStream?.name ?? 'Direct Stream'} • {currentStream?.quality ?? '1080p'}
            </Txt>
          </View>
          {!isEmbed ? (
            <Pressable hitSlop={10} onPress={toggleMute} style={[styles.topPill, { marginRight: 8 }]}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable
              hitSlop={10}
              onPress={() => {
                setStreamIndex(0);
                setEmbedFailed(false);
                showToast('Switched to Native Player');
              }}
              style={[styles.topPill, { marginRight: 8, backgroundColor: colors.red }]}
            >
              <Ionicons name="play-circle-outline" size={16} color={colors.text} />
              <Txt weight="bold" size={12} style={{ marginLeft: 4 }}>
                Native Player
              </Txt>
            </Pressable>
          )}
          {title.kind === 'series' && found ? (
            <Pressable hitSlop={12} onPress={() => setPanel('episodes')} style={[styles.topPill, { marginRight: 8 }]}>
              <MaterialCommunityIcons name="cards-outline" size={16} color={colors.text} />
              <Txt weight="semibold" size={12} style={{ marginLeft: 4 }}>
                Episodes
              </Txt>
            </Pressable>
          ) : null}
          <Pressable hitSlop={12} onPress={() => setPanel('audio')} style={styles.topPill}>
            <MaterialCommunityIcons name="server-network" size={17} color={colors.text} />
            <Txt weight="semibold" size={12} style={{ marginLeft: 5 }}>
              Servers ({streams.length})
            </Txt>
          </Pressable>
        </View>

        {!isEmbed ? (
          <View style={styles.centerControls} pointerEvents="box-none">
            <Pressable hitSlop={16} onPress={() => seekBy(-10)} style={styles.transportBtn}>
              <MaterialCommunityIcons name="rewind-10" size={44} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={16} onPress={togglePlay} style={[styles.transportBtn, styles.playCenterBtn]}>
              <Ionicons
                name={
                  duration > 0 && position >= duration - 1
                    ? 'refresh'
                    : isPlaying
                      ? 'pause'
                      : 'play'
                }
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
          <View
            style={[
              styles.bottom,
              {
                paddingLeft: insets.left + 20,
                paddingRight: insets.right + 20,
                paddingBottom: Math.max(12, insets.bottom + 10),
              },
            ]}
          >
            <SeekBar
              position={position}
              buffered={buffered}
              duration={duration}
              onSeek={seekTo}
              onScrubChange={setScrubbing}
            />
            <View style={styles.bottomActions}>
              <BottomAction icon="speedometer" label={`Speed (${speed}x)`} onPress={() => setPanel('speed')} />
              <BottomAction
                icon={currentFit.icon}
                label={currentFit.label}
                onPress={cycleFitMode}
              />
              <BottomAction
                icon="lock-open-variant-outline"
                label="Lock"
                onPress={() => {
                  setLocked(true);
                  setUnlockArmed(false);
                }}
              />
              <BottomAction
                icon={downloadIcon}
                label={downloadLabel}
                active={offline?.status === 'downloaded' || offline?.status === 'downloading'}
                onPress={handleDownloadAction}
              />
              <BottomAction
                icon="subtitles-outline"
                label={subtitle === 'Off' ? 'Audio & CC' : `CC: ${subtitle}`}
                active={subtitle !== 'Off'}
                onPress={() => setPanel('audio')}
              />
              {next ? (
                <BottomAction
                  icon="skip-next"
                  label="Next Ep."
                  onPress={() => navigation.replace('Player', { id: title.id, episodeId: next.id })}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </Animated.View>

      {showSkipIntro && !locked ? (
        <Pressable onPress={() => seekTo(40)} style={[styles.floating, { right: insets.right + 24 }]}>
          <Txt weight="bold" size={14}>
            Skip Intro
          </Txt>
        </Pressable>
      ) : null}
      {showNext && !locked ? (
        <Pressable
          onPress={() => next && navigation.replace('Player', { id: title.id, episodeId: next.id })}
          style={[styles.floating, styles.nextButton, { right: insets.right + 24 }]}
        >
          <MaterialCommunityIcons name="skip-next" size={20} color="#000000" />
          <Txt weight="bold" size={14} color="#000000" style={{ marginLeft: 6 }}>
            Next Episode
          </Txt>
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
          <Txt weight="semibold" size={14} style={{ marginTop: 8 }}>
            {unlockArmed ? 'Unlock controls?' : 'Screen Locked'}
          </Txt>
          <Txt size={12} color={colors.textMuted}>
            {unlockArmed ? 'Tap again to unlock' : 'Tap to Unlock'}
          </Txt>
        </View>
      ) : null}

      {panel !== 'none' ? (
        <View style={styles.panel}>
          <Pressable hitSlop={12} onPress={() => setPanel('none')} style={[styles.panelClose, { right: insets.right + 24 }]}>
            <Ionicons name="close" size={30} color={colors.text} />
          </Pressable>

          {panel === 'speed' ? (
            <View style={styles.speedWrap}>
              <Txt weight="bold" size={20} align="center" style={{ marginBottom: 40 }}>
                Playback Speed
              </Txt>
              <View style={styles.speedRow}>
                <View style={styles.speedLine} />
                {SPEEDS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => {
                      setSpeed(s);
                      player.playbackRate = s;
                      setPanel('none');
                      showHUD('speedometer', `Speed ${s}x`);
                    }}
                    style={styles.speedOption}
                  >
                    <View style={[styles.speedDot, s === speed ? styles.speedDotActive : null]} />
                    <Txt weight={s === speed ? 'bold' : 'regular'} size={14} style={{ marginTop: 14 }}>
                      {s === 1 ? '1x (Normal)' : `${s}x`}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {panel === 'audio' ? (
            <View style={[styles.audioWrap, { paddingLeft: insets.left + 30, paddingRight: insets.right + 30 }]}>
              {/* Column 1: Multi-Server Streaming Source */}
              <View style={{ flex: 1.4, marginRight: 16 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 14 }}>
                  Streaming Server
                </Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {streams.map((s, idx) => (
                    <Pressable
                      key={s.id + idx}
                      onPress={() => {
                        setStreamIndex(idx);
                        setEmbedFailed(false);
                        setPanel('none');
                        showToast(`Switched server: ${s.name}`);
                      }}
                      style={styles.audioOption}
                    >
                      <View style={{ width: 24 }}>
                        {idx === streamIndex ? <Ionicons name="checkmark" size={20} color={colors.red} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt
                          weight={idx === streamIndex ? 'bold' : 'regular'}
                          size={14}
                          color={idx === streamIndex ? colors.text : colors.textMuted}
                          numberOfLines={1}
                        >
                          {s.name}
                        </Txt>
                        <Txt size={11} color={colors.textDim}>
                          {s.quality || '1080p'} • {s.kind === 'embed' ? 'Web Embed' : 'Direct Native'} • {s.language || 'Multi-Audio'}
                        </Txt>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Column 2: Audio Language */}
              <View style={{ flex: 1, marginRight: 16 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 14 }}>
                  Audio Track
                </Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {AUDIO.map((o) => (
                    <Pressable
                      key={o}
                      onPress={() => {
                        setAudio(o);
                        showToast(`Audio set to ${o}`);
                      }}
                      style={styles.audioOption}
                    >
                      <View style={{ width: 24 }}>
                        {o === audio ? <Ionicons name="checkmark" size={20} color={colors.red} /> : null}
                      </View>
                      <Txt weight={o === audio ? 'bold' : 'regular'} size={15} color={o === audio ? colors.text : colors.textMuted}>
                        {o}
                      </Txt>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Column 3: Subtitles */}
              <View style={{ flex: 0.9 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 14 }}>
                  Subtitles (CC)
                </Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {SUBTITLES.map((o) => (
                    <Pressable
                      key={o}
                      onPress={() => {
                        setSubtitle(o);
                        showToast(o === 'Off' ? 'Subtitles turned off' : `Subtitles: ${o}`);
                      }}
                      style={styles.audioOption}
                    >
                      <View style={{ width: 24 }}>
                        {o === subtitle ? <Ionicons name="checkmark" size={20} color={colors.red} /> : null}
                      </View>
                      <Txt
                        weight={o === subtitle ? 'bold' : 'regular'}
                        size={15}
                        color={o === subtitle ? colors.text : colors.textMuted}
                      >
                        {o}
                      </Txt>
                    </Pressable>
                  ))}
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
                    style={[
                      styles.seasonChip,
                      s.number === found.season.number ? styles.seasonChipActive : null,
                    ]}
                  >
                    <Txt weight="bold" size={13} color={s.number === found.season.number ? '#000000' : colors.text}>
                      Season {s.number}
                    </Txt>
                  </Pressable>
                ))}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: insets.left + 40, gap: 14 }}
              >
                {found.season.episodes.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => navigation.replace('Player', { id: title.id, episodeId: e.id })}
                    style={{ width: 220 }}
                  >
                    <View style={[styles.epThumb, e.id === episode?.id ? styles.epThumbActive : null]}>
                      <Image source={img.still(e.seed)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                      <View style={styles.epPlayBadge}>
                        <Ionicons name={e.id === episode?.id ? 'volume-high' : 'play'} size={16} color={colors.text} />
                      </View>
                    </View>
                    <Txt weight="semibold" size={14} numberOfLines={1} style={{ marginTop: 8 }}>
                      {e.number}. {e.name}
                    </Txt>
                    <Txt size={12} color={colors.textMuted} numberOfLines={2} style={{ marginTop: 4 }}>
                      {e.synopsis}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}
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
