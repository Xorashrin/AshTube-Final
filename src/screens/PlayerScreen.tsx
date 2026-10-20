import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEvent, useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { Txt } from '../components/Txt';
import { img } from '../data/images';
import { findEpisode, getTitle, nextEpisode } from '../data/mock';
import { resolveTitle } from '../data/resolveTitle';
import type { RootStackParamList } from '../navigation/types';
import { downloadFor, useApp } from '../state/AppState';
import { colors, motion } from '../theme/tokens';
import { formatClock } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;
type Panel = 'none' | 'speed' | 'episodes' | 'audio';
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
const AUDIO = ['English [Original]', 'Bangla', 'Hindi', 'Spanish'];
const SUBTITLES = ['Off', 'English', 'English [CC]', 'Bangla', 'Hindi'];
const HIDE_AFTER = 4000;

const INJECTED_AD_SHIELD = `
  (function() {
    try {
      window.open = function() { return null; };
      window.alert = function() { return null; };
      window.confirm = function() { return false; };
      window.prompt = function() { return null; };
      window.onbeforeunload = null;
      var style = document.createElement('style');
      style.innerHTML = '.ad, .ads, [class*="banner"], [id*="banner"], [class*="pop"], [id*="pop"] { display: none !important; pointer-events: none !important; }';
      document.head && document.head.appendChild(style);
    } catch(e) {}
  })();
  true;
`;

function SeekBar({ position, duration, onSeek, onScrubChange }: { position: number; duration: number; onSeek: (t: number) => void; onScrubChange: (t: number | null) => void }) {
  const width = useRef(1);
  const start = useRef(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const ratio = duration > 0 ? (scrub ?? position) / duration : 0;

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
      <View style={styles.seekTouch} onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))} {...responder.panHandlers}>
        <View style={styles.seekTrack} pointerEvents="none">
          <View style={[styles.seekFill, { width: `${ratio * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.seekThumb, { left: `${ratio * 100}%` }, scrub !== null ? styles.seekThumbActive : null]} />
      </View>
      <Txt weight="medium" size={13} style={{ marginLeft: 14, minWidth: 52 }} align="right">
        {formatClock(Math.max(0, duration - (scrub ?? position)))}
      </Txt>
    </View>
  );
}

function BottomAction({ icon, label, onPress }: { icon: MciName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.bottomAction}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.text} />
      <Txt weight="medium" size={13} style={{ marginLeft: 8 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export default function PlayerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { setProgress, state, showToast, profileData } = useApp();
  const title = resolveTitle(route.params.id);
  const found = title.kind === 'series' ? findEpisode(title, route.params.episodeId) : null;
  const episode = found?.episode;
  const next = episode ? nextEpisode(title, episode.id) : null;
  const offline = downloadFor(profileData, title.id, episode?.id);
  // Prefer the downloaded file so playback works offline.
  const fileSource = offline?.status === 'downloaded' && offline.localUri ? offline.localUri : episode?.video ?? title.video;

  // Multi-source rotation (requirement: full-movie backend).
  // `title.streams` carries a list of {name, url, kind} objects — for
  // Cinemeta-backed titles we have 2embed + multiembed + vidsrc + trailer;
  // for adult titles we have the xvideos embed. PlayerScreen tries each
  // source in order until one loads without an error.
  const streams = useMemo(() => {
    const s = (title as unknown as { streams?: { name: string; url: string; kind: string }[] }).streams ?? [];
    // Always include the primary fileSource as a candidate
    return [{ name: 'primary', url: fileSource, kind: fileSource.endsWith('.m3u8') || fileSource.endsWith('.mp4') ? 'hls' : 'embed' }, ...s];
  }, [fileSource, title]);
  const [streamIndex, setStreamIndex] = useState(0);
  const [embedFailed, setEmbedFailed] = useState(false);
  const currentStream = streams[streamIndex] ?? streams[0];
  const isEmbed = currentStream && currentStream.kind === 'embed';
  // Pick the HLS/mp4 URL only when NOT an embed — we feed it to the native video player.
  const source = isEmbed ? null : fileSource;

  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [unlockArmed, setUnlockArmed] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [speed, setSpeed] = useState(1);
  const [audio, setAudio] = useState(AUDIO[0]);
  const [subtitle, setSubtitle] = useState(SUBTITLES[0]);
  const [seekHint, setSeekHint] = useState<'back' | 'forward' | null>(null);
  const [brightness, setBrightness] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [gestureHUD, setGestureHUD] = useState<{ icon: string; text: string } | null>(null);
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHUD = (icon: string, text: string) => {
    setGestureHUD({ icon, text });
    if (gestureTimer.current) clearTimeout(gestureTimer.current);
    gestureTimer.current = setTimeout(() => setGestureHUD(null), 1200);
  };

  const screenWidth = useRef(1);
  const screenHeight = useRef(1);
  const startY = useRef(0);
  const startVal = useRef(0);
  const isLeft = useRef(false);

  const latest = useRef({ position: 0, duration: 0 });
  const lastTap = useRef<{ side: 'left' | 'right'; at: number } | null>(null);

  const onSurfacePress = (side: 'left' | 'right') => {
    if (locked) {
      setVisible(true);
      return;
    }
    const nowMs = Date.now();
    if (state.settings.doubleTapSeek && lastTap.current && lastTap.current.side === side && nowMs - lastTap.current.at < 320) {
      seekBy(side === 'left' ? -10 : 10);
      lastTap.current = null;
      return;
    }
    lastTap.current = { side, at: nowMs };
    setVisible((v) => !v);
  };

  const surfaceResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => !locked && (Math.abs(g.dy) > 12 || Math.abs(g.dx) > 12),
        onPanResponderGrant: (e) => {
          startY.current = e.nativeEvent.pageY;
          const touchX = e.nativeEvent.pageX;
          isLeft.current = touchX < screenWidth.current / 2;
          startVal.current = isLeft.current ? brightness : volume;
        },
        onPanResponderMove: (_, g) => {
          if (!state.settings.swipeGestures || locked) return;
          const delta = -g.dy / (screenHeight.current * 0.75);
          const newVal = Math.max(0.15, Math.min(1.0, startVal.current + delta));
          if (isLeft.current) {
            setBrightness(newVal);
            showHUD('weather-sunny', `Brightness ${Math.round(newVal * 100)}%`);
          } else {
            setVolume(newVal);
            player.volume = newVal;
            showHUD(newVal <= 0.05 ? 'volume-mute' : 'volume-high', `Volume ${Math.round(newVal * 100)}%`);
          }
        },
        onPanResponderRelease: (e, g) => {
          if (Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
            const touchX = e.nativeEvent.pageX;
            onSurfacePress(touchX < screenWidth.current / 2 ? 'left' : 'right');
          }
        },
      }),
    [locked, brightness, volume, state.settings.swipeGestures, player],
  );

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setPosition(currentTime);
    latest.current.position = currentTime;
    if (player.duration > 0) {
      latest.current.duration = player.duration;
      setDuration(player.duration);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (next && state.settings.autoplayNext) navigation.replace('Player', { id: title.id, episodeId: next.id });
    else navigation.goBack();
  });

  // Save watch progress when leaving the player.
  useEffect(
    () => () => {
      const { position: pos, duration: dur } = latest.current;
      if (dur > 0 && pos > 5) setProgress({ titleId: title.id, episodeId: episode?.id, position: pos, duration: dur, updatedAt: Date.now() });
    },
    [setProgress, title.id, episode?.id],
  );

  // Auto-hide controls while playing.
  useEffect(() => {
    if (!visible || !isPlaying || panel !== 'none' || scrubbing !== null) return;
    const timer = setTimeout(() => setVisible(false), HIDE_AFTER);
    return () => clearTimeout(timer);
  }, [visible, isPlaying, panel, scrubbing, position]);

  useEffect(() => {
    if (!seekHint) return;
    const timer = setTimeout(() => setSeekHint(null), 600);
    return () => clearTimeout(timer);
  }, [seekHint]);

  const fade = useSharedValue(1);
  useEffect(() => {
    fade.value = withTiming(visible && !locked ? 1 : 0, { duration: motion.base });
  }, [visible, locked, fade]);
  const controlsStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const seekBy = useCallback(
    (delta: number) => {
      player.seekBy(delta);
      setSeekHint(delta < 0 ? 'back' : 'forward');
    },
    [player],
  );
  const seekTo = useCallback((t: number) => (player.currentTime = t), [player]);
  const togglePlay = () => (isPlaying ? player.pause() : player.play());

  const heading = episode && found ? `${title.name}: S${found.season.number}:E${episode.number} “${episode.name}”` : title.name;
  const showSkipIntro = title.kind === 'series' && position > 5 && position < 35;
  const showNext = !!next && duration > 0 && duration - position < 25;
  const pointer = visible && !locked ? 'box-none' : 'none';

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {isEmbed && currentStream?.url ? (
        <View style={StyleSheet.absoluteFill}>
          <WebView
            source={{ uri: currentStream.url }}
            style={StyleSheet.absoluteFill}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            injectedJavaScriptBeforeContentLoaded={INJECTED_AD_SHIELD}
            onShouldStartLoadWithRequest={(req) => {
              if (req.url === currentStream.url || req.mainDocumentURL === currentStream.url || !currentStream.url) {
                return true;
              }
              const u = req.url.toLowerCase();
              if (
                u.startsWith('intent:') ||
                u.startsWith('market:') ||
                u.startsWith('vnd.youtube:') ||
                u.includes('doubleclick') ||
                u.includes('popunder') ||
                u.includes('adsterra') ||
                u.includes('onclick') ||
                u.includes('redirect') ||
                u.includes('betting') ||
                u.includes('casino') ||
                u.includes('traffic')
              ) {
                return false;
              }
              return true;
            }}
            onError={() => {
              if (streamIndex + 1 < streams.length) {
                setStreamIndex(streamIndex + 1);
                showToast(`Switching source: ${streams[streamIndex + 1].name}`);
              } else {
                setEmbedFailed(true);
                showToast('All sources failed');
              }
            }}
            renderLoading={() => (
              <View style={StyleSheet.absoluteFill}>
                <ActivityIndicator size="large" color={colors.text} />
              </View>
            )}
          />
          {embedFailed ? (
            <View style={StyleSheet.absoluteFill}>
              <Txt align="center" size={14} color={colors.textMuted}>
                Source failed. Try another server from Server & Audio.
              </Txt>
            </View>
          ) : null}
        </View>
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      )}

      {/* Dimmer overlay for swipe brightness control (0 extra permissions) */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: (1 - brightness) * 0.82 }]}
      />

      {/* Gesture surface tracking touches & swipes */}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          screenWidth.current = e.nativeEvent.layout.width;
          screenHeight.current = e.nativeEvent.layout.height;
        }}
        {...surfaceResponder.panHandlers}
      />

      {status === 'loading' ? <ActivityIndicator size="large" color={colors.red} style={styles.center} /> : null}

      {gestureHUD ? (
        <View pointerEvents="none" style={styles.hudBubble}>
          <MaterialCommunityIcons name={gestureHUD.icon as any} size={24} color={colors.text} />
          <Txt weight="bold" size={14} style={{ marginLeft: 8 }}>
            {gestureHUD.text}
          </Txt>
        </View>
      ) : null}

      {seekHint ? (
        <View pointerEvents="none" style={[styles.seekHint, seekHint === 'back' ? { left: '15%' } : { right: '15%' }]}>
          <MaterialCommunityIcons name={seekHint === 'back' ? 'rewind-10' : 'fast-forward-10'} size={40} color={colors.text} />
        </View>
      ) : null}

      <Animated.View pointerEvents={pointer} style={[StyleSheet.absoluteFill, controlsStyle]}>
        <View pointerEvents="none" style={styles.dim} />
        <View style={[styles.top, { paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
          <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color={colors.text} />
          </Pressable>
          <Txt weight="semibold" size={15} numberOfLines={1} align="center" style={{ flex: 1, marginHorizontal: 16 }}>
            {heading}
          </Txt>
          <Pressable hitSlop={12} onPress={() => showToast('Thanks! Report a Problem arrives in a later phase')}>
            <MaterialCommunityIcons name="flag-outline" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.centerControls} pointerEvents="box-none">
          <Pressable hitSlop={16} onPress={() => seekBy(-10)}>
            <MaterialCommunityIcons name="rewind-10" size={46} color={colors.text} />
          </Pressable>
          <Pressable hitSlop={16} onPress={togglePlay} style={{ marginHorizontal: 70 }}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={64} color={colors.text} />
          </Pressable>
          <Pressable hitSlop={16} onPress={() => seekBy(10)}>
            <MaterialCommunityIcons name="fast-forward-10" size={46} color={colors.text} />
          </Pressable>
        </View>

        <View style={[styles.bottom, { paddingLeft: insets.left + 24, paddingRight: insets.right + 24, paddingBottom: insets.bottom + 14 }]}>
          <SeekBar position={position} duration={duration} onSeek={seekTo} onScrubChange={setScrubbing} />
          <View style={styles.bottomActions}>
            <BottomAction icon="speedometer" label={`Speed (${speed}x)`} onPress={() => setPanel('speed')} />
            <BottomAction icon="lock-open-variant-outline" label="Lock" onPress={() => { setLocked(true); setUnlockArmed(false); }} />
            {title.kind === 'series' ? <BottomAction icon="cards-outline" label="Episodes" onPress={() => setPanel('episodes')} /> : null}
            <BottomAction icon="server-network" label="Server & Audio" onPress={() => setPanel('audio')} />
            {next ? <BottomAction icon="skip-next" label="Next Ep." onPress={() => navigation.replace('Player', { id: title.id, episodeId: next.id })} /> : null}
          </View>
        </View>
      </Animated.View>

      {showSkipIntro && !locked ? (
        <Pressable onPress={() => seekTo(40)} style={[styles.floating, { right: insets.right + 24 }]}>
          <Txt weight="bold" size={14}>
            Skip Intro
          </Txt>
        </Pressable>
      ) : null}
      {showNext && !locked ? (
        <Pressable onPress={() => next && navigation.replace('Player', { id: title.id, episodeId: next.id })} style={[styles.floating, styles.nextButton, { right: insets.right + 24 }]}>
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
              <View style={{ flex: 1.3, marginRight: 16 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 14 }}>
                  Streaming Server
                </Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {streams.map((s, idx) => (
                    <Pressable
                      key={s.name + idx}
                      onPress={() => {
                        setStreamIndex(idx);
                        setEmbedFailed(false);
                        showToast(`Switched server: ${s.name}`);
                      }}
                      style={styles.audioOption}
                    >
                      <View style={{ width: 24 }}>
                        {idx === streamIndex ? <Ionicons name="checkmark" size={20} color={colors.text} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt weight={idx === streamIndex ? 'bold' : 'regular'} size={15} color={idx === streamIndex ? colors.text : colors.textMuted} numberOfLines={1}>
                          {s.name}
                        </Txt>
                        <Txt size={11} color={colors.textDim}>
                          {(s as any).quality || 'HD'} • {(s as any).language || 'Multi-Audio'}
                        </Txt>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Column 2: Audio Language */}
              <View style={{ flex: 1, marginRight: 16 }}>
                <Txt weight="bold" size={18} style={{ marginBottom: 14 }}>
                  Audio Language
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
                        {o === audio ? <Ionicons name="checkmark" size={20} color={colors.text} /> : null}
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
                  Subtitles
                </Txt>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {SUBTITLES.map((o) => (
                    <Pressable key={o} onPress={() => setSubtitle(o)} style={styles.audioOption}>
                      <View style={{ width: 24 }}>
                        {o === subtitle ? <Ionicons name="checkmark" size={20} color={colors.text} /> : null}
                      </View>
                      <Txt weight={o === subtitle ? 'bold' : 'regular'} size={15} color={o === subtitle ? colors.text : colors.textMuted}>
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
              <Txt weight="bold" size={20} style={{ marginLeft: insets.left + 40, marginBottom: 16 }}>
                Season {found.season.number}
              </Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: insets.left + 40, gap: 14 }}>
                {found.season.episodes.map((e) => (
                  <Pressable key={e.id} onPress={() => navigation.replace('Player', { id: title.id, episodeId: e.id })} style={{ width: 220 }}>
                    <View style={[styles.epThumb, e.id === episode?.id ? styles.epThumbActive : null]}>
                      <Image source={img.still(e.seed)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
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
  tapZones: { flex: 1, flexDirection: 'row' },
  center: { position: 'absolute', alignSelf: 'center', top: '45%' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  top: { flexDirection: 'row', alignItems: 'center', paddingTop: 20 },
  centerControls: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  seekRow: { flexDirection: 'row', alignItems: 'center' },
  seekTouch: { flex: 1, height: 30, justifyContent: 'center' },
  seekTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 },
  seekFill: { height: 3, backgroundColor: colors.red, borderRadius: 2 },
  seekThumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, backgroundColor: colors.red },
  seekThumbActive: { width: 22, height: 22, borderRadius: 11, marginLeft: -11 },
  bottomActions: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 10 },
  bottomAction: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  seekHint: { position: 'absolute', top: '42%', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  floating: {
    position: 'absolute',
    bottom: 110,
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  nextButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.text, borderColor: colors.text },
  lockWrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center' },
  lockButton: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: colors.text, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' },
  panelClose: { position: 'absolute', top: 20, zIndex: 2 },
  speedWrap: { alignItems: 'center' },
  speedRow: { flexDirection: 'row', alignItems: 'flex-start', width: '75%', justifyContent: 'space-between' },
  speedLine: { position: 'absolute', left: '10%', right: '10%', top: 11, height: 2, backgroundColor: colors.textDim },
  speedOption: { alignItems: 'center', width: 100 },
  speedDot: { width: 14, height: 14, borderRadius: 7, marginTop: 4, backgroundColor: colors.textDim },
  speedDotActive: { width: 24, height: 24, borderRadius: 12, marginTop: 0, backgroundColor: colors.text },
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
  epThumb: { width: 220, height: 124, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 2, borderColor: 'transparent' },
  epThumbActive: { borderColor: colors.text },
});
