import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEvent, useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChannelLogo } from '../components/ChannelLogo';
import { Txt } from '../components/Txt';
import { filterChannels, getChannel, neighbor } from '../data/channels';
import type { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, motion } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Live'>;
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const LOAD_TIMEOUT_MS = 14000;
const FIT_MODES: { mode: VideoContentFit; label: string; icon: MciName }[] = [
  { mode: 'contain', label: 'Fit', icon: 'aspect-ratio' },
  { mode: 'cover', label: 'Zoom', icon: 'fullscreen' },
  { mode: 'fill', label: 'Stretch', icon: 'arrow-expand-all' },
];

export default function LivePlayerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { state, showToast } = useApp();
  const channel = getChannel(route.params.channelId);
  const list = useMemo(() => filterChannels(route.params.filter ?? 'All'), [route.params.filter]);
  const sources = useMemo(() => {
    if (!channel) return [];
    const raw = [channel.url, ...channel.fallbacks];
    return Array.from(new Set(raw.filter(Boolean)));
  }, [channel]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [unlockArmed, setUnlockArmed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fitIndex, setFitIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brightness, setBrightness] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [gestureHUD, setGestureHUD] = useState<{ icon: MciName; text: string } | null>(null);
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancing = useRef(false);

  const showHUD = useCallback((icon: MciName, text: string) => {
    setGestureHUD({ icon, text });
    if (gestureTimer.current) clearTimeout(gestureTimer.current);
    gestureTimer.current = setTimeout(() => setGestureHUD(null), 1200);
  }, []);

  const player = useVideoPlayer(sources[0] ?? null, (p) => {
    p.keepScreenOnWhilePlaying = true;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // A source that errors (or never becomes ready) falls through to the next working source.
  const indexRef = useRef(0);
  const tryNextSource = useCallback(() => {
    if (advancing.current || failed) return;
    const next = indexRef.current + 1;
    if (next >= sources.length) {
      setFailed(true);
      return;
    }
    advancing.current = true;
    indexRef.current = next;
    setSourceIndex(next);
    player
      .replaceAsync(sources[next])
      .then(() => {
        player.muted = muted;
        player.volume = volume;
        player.play();
      })
      .catch(() => undefined)
      .finally(() => {
        advancing.current = false;
      });
  }, [failed, sources, player, muted, volume]);

  useEventListener(player, 'statusChange', ({ status: s }) => {
    if (s === 'error') tryNextSource();
  });

  useEffect(() => {
    if (status === 'readyToPlay' || failed) return;
    const timer = setTimeout(tryNextSource, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, sourceIndex, failed, tryNextSource]);

  useEffect(() => {
    if (!visible || !isPlaying || drawerOpen || locked) return;
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [visible, isPlaying, drawerOpen, locked]);

  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: visible && !locked ? 1 : 0, duration: motion.base, useNativeDriver: true }).start();
  }, [visible, locked, fade]);
  const controlsStyle = { opacity: fade };

  const screenWidth = useRef(1);
  const screenHeight = useRef(1);
  const startY = useRef(0);
  const startVal = useRef(0);
  const isLeft = useRef(false);

  const surfaceResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => !locked && Math.abs(g.dy) > 14,
        onPanResponderGrant: (e) => {
          startY.current = e.nativeEvent.pageY;
          isLeft.current = e.nativeEvent.pageX < screenWidth.current / 2;
          startVal.current = isLeft.current ? brightness : volume;
        },
        onPanResponderMove: (_, g) => {
          if (!state.settings.swipeGestures || locked) return;
          const delta = -g.dy / (screenHeight.current * 0.75);
          const newVal = Math.max(0.05, Math.min(1.0, startVal.current + delta));
          if (isLeft.current) {
            const b = Math.max(0.15, newVal);
            setBrightness(b);
            showHUD('weather-sunny', `Brightness ${Math.round(b * 100)}%`);
          } else {
            const v = newVal <= 0.06 ? 0 : newVal;
            setVolume(v);
            setMuted(v === 0);
            player.muted = v === 0;
            player.volume = v;
            showHUD(v === 0 ? 'volume-mute' : 'volume-high', `Volume ${Math.round(v * 100)}%`);
          }
        },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < 12 && Math.abs(g.dy) < 12) {
            setVisible((v) => !v);
          }
        },
      }),
    [locked, brightness, volume, state.settings.swipeGestures, player, showHUD],
  );

  const zap = (step: 1 | -1) => {
    if (!channel) return;
    const next = neighbor(list, channel.id, step);
    if (next) navigation.replace('Live', { channelId: next.id, filter: route.params.filter });
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    player.muted = nextMuted;
    showHUD(nextMuted ? 'volume-off' : 'volume-high', nextMuted ? 'Muted' : `Volume ${Math.round(volume * 100)}%`);
  };

  const cycleFit = () => {
    const nextIdx = (fitIndex + 1) % FIT_MODES.length;
    setFitIndex(nextIdx);
    showHUD(FIT_MODES[nextIdx].icon, `Display: ${FIT_MODES[nextIdx].label}`);
  };

  if (!channel) {
    return (
      <View style={[styles.root, styles.center]}>
        <Txt size={16}>This channel is no longer available.</Txt>
      </View>
    );
  }

  const currentFit = FIT_MODES[fitIndex];

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={currentFit.mode}
        surfaceType="textureView"
        nativeControls={false}
      />

      {/* Dimmer overlay for swipe brightness */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: (1 - brightness) * 0.82 }]}
      />

      <View
        style={StyleSheet.absoluteFill}
        onLayout={(e) => {
          screenWidth.current = Math.max(1, e.nativeEvent.layout.width);
          screenHeight.current = Math.max(1, e.nativeEvent.layout.height);
        }}
        {...surfaceResponder.panHandlers}
      />

      {gestureHUD ? (
        <View pointerEvents="none" style={styles.hudBubble}>
          <MaterialCommunityIcons name={gestureHUD.icon} size={22} color={colors.text} />
          <Txt weight="bold" size={14} style={{ marginLeft: 8 }}>
            {gestureHUD.text}
          </Txt>
        </View>
      ) : null}

      {failed ? (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.dim]}>
          <MaterialCommunityIcons name="television-off" size={48} color={colors.textMuted} />
          <Txt weight="bold" size={18} style={{ marginTop: 12 }}>
            {channel.name} is offline right now
          </Txt>
          <Txt size={13} color={colors.textMuted} style={{ marginTop: 6 }}>
            Live channels sometimes go down. Try another channel or retry.
          </Txt>
          <View style={styles.failActions}>
            <Pressable
              onPress={() => {
                setFailed(false);
                indexRef.current = 0;
                setSourceIndex(0);
                player.replaceAsync(sources[0]).then(() => player.play()).catch(() => undefined);
              }}
              style={styles.failButton}
            >
              <Txt weight="bold" size={14} color="#000000">
                Retry
              </Txt>
            </Pressable>
            <Pressable onPress={() => zap(1)} style={styles.failButton}>
              <Txt weight="bold" size={14} color="#000000">
                Next Channel
              </Txt>
            </Pressable>
            <Pressable onPress={() => navigation.goBack()} style={[styles.failButton, styles.failGhost]}>
              <Txt weight="bold" size={14}>
                Back
              </Txt>
            </Pressable>
          </View>
        </View>
      ) : status !== 'readyToPlay' ? (
        <View pointerEvents="none" style={styles.spinner}>
          <ActivityIndicator size="large" color={colors.red} />
          <Txt size={12} color={colors.textMuted} style={{ marginTop: 8 }}>
            Connecting to {channel.name}…
          </Txt>
        </View>
      ) : null}

      {!failed ? (
        <Animated.View pointerEvents={visible && !locked ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, controlsStyle]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} />
          <View style={[styles.top, { paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
            <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={28} color={colors.text} />
            </Pressable>
            <View style={styles.titleWrap}>
              <ChannelLogo channel={channel} size={52} />
              <View style={{ marginLeft: 12, flexShrink: 1 }}>
                <Txt weight="bold" size={16} numberOfLines={1}>
                  {channel.name}
                </Txt>
                <Txt size={12} color={colors.textMuted} numberOfLines={1}>
                  {channel.category} • {channel.country}
                  {channel.quality ? ` • ${channel.quality}` : ''}
                </Txt>
              </View>
            </View>
            <Pressable hitSlop={10} onPress={toggleMute} style={styles.topActionPill}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => setDrawerOpen(true)} style={styles.topActionPill}>
              <MaterialCommunityIcons name="playlist-play" size={19} color={colors.text} />
              <Txt weight="semibold" size={12} style={{ marginLeft: 4 }}>
                Channels
              </Txt>
            </Pressable>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Txt weight="bold" size={12}>
                LIVE
              </Txt>
            </View>
          </View>

          <View style={styles.centerControls} pointerEvents="box-none">
            <Pressable hitSlop={16} onPress={() => zap(-1)}>
              <MaterialCommunityIcons name="skip-previous" size={46} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={16} onPress={() => (isPlaying ? player.pause() : player.play())} style={{ marginHorizontal: 70 }}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={64} color={colors.text} />
            </Pressable>
            <Pressable hitSlop={16} onPress={() => zap(1)}>
              <MaterialCommunityIcons name="skip-next" size={46} color={colors.text} />
            </Pressable>
          </View>

          <View style={[styles.bottomBar, { paddingLeft: insets.left + 24, paddingRight: insets.right + 24, paddingBottom: insets.bottom + 14 }]}>
            <Pressable onPress={cycleFit} style={styles.bottomAction}>
              <MaterialCommunityIcons name={currentFit.icon} size={20} color={colors.text} />
              <Txt weight="medium" size={13} style={{ marginLeft: 6 }}>
                {currentFit.label}
              </Txt>
            </Pressable>
            <Pressable
              onPress={() => {
                setLocked(true);
                setUnlockArmed(false);
              }}
              style={styles.bottomAction}
            >
              <MaterialCommunityIcons name="lock-open-variant-outline" size={20} color={colors.text} />
              <Txt weight="medium" size={13} style={{ marginLeft: 6 }}>
                Lock
              </Txt>
            </Pressable>
            <Pressable
              onPress={() => {
                tryNextSource();
                showToast('Switching backup stream feed…');
              }}
              style={styles.bottomAction}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={20} color={colors.text} />
              <Txt weight="medium" size={13} style={{ marginLeft: 6 }}>
                Switch Feed ({sourceIndex + 1}/{sources.length})
              </Txt>
            </Pressable>
            <Pressable onPress={() => setDrawerOpen(true)} style={styles.bottomAction}>
              <MaterialCommunityIcons name="television-guide" size={20} color={colors.text} />
              <Txt weight="medium" size={13} style={{ marginLeft: 6 }}>
                Channel List
              </Txt>
            </Pressable>
          </View>
        </Animated.View>
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
        </View>
      ) : null}

      {drawerOpen ? (
        <View style={styles.drawerOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setDrawerOpen(false)} />
          <View style={[styles.drawerPanel, { paddingRight: insets.right + 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.drawerHeader}>
              <Txt weight="bold" size={17}>
                Live Channels ({list.length})
              </Txt>
              <Pressable hitSlop={10} onPress={() => setDrawerOpen(false)}>
                <Ionicons name="close" size={26} color={colors.text} />
              </Pressable>
            </View>
            <FlatList
              data={list.slice(0, 80)}
              keyExtractor={(c) => c.id}
              initialNumToRender={14}
              renderItem={({ item }) => {
                const active = item.id === channel.id;
                return (
                  <Pressable
                    onPress={() => {
                      setDrawerOpen(false);
                      navigation.replace('Live', { channelId: item.id, filter: route.params.filter });
                    }}
                    style={[styles.drawerRow, active ? styles.drawerRowActive : null]}
                  >
                    <ChannelLogo channel={item} size={40} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Txt weight={active ? 'bold' : 'medium'} size={14} numberOfLines={1}>
                        {item.name}
                      </Txt>
                      <Txt size={11} color={colors.textMuted} numberOfLines={1}>
                        {item.category} • {item.country}
                      </Txt>
                    </View>
                    {active ? <Ionicons name="volume-high" size={18} color={colors.red} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  dim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  spinner: { position: 'absolute', alignSelf: 'center', top: '44%', alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', paddingTop: 20 },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 14 },
  topActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    marginRight: 8,
  },
  livePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.red, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.text, marginRight: 6 },
  centerControls: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  bottomAction: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  failActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  failButton: { backgroundColor: colors.text, borderRadius: 4, paddingHorizontal: 20, paddingVertical: 10 },
  failGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.text },
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
  drawerOverlay: { ...StyleSheet.absoluteFill, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)' },
  drawerPanel: { width: 320, backgroundColor: '#121212', paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)' },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  drawerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6 },
  drawerRowActive: { backgroundColor: 'rgba(229,9,20,0.18)' },
});
