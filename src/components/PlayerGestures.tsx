// Touch layer for the video player: swipe the left half for brightness, the right half for volume,
// swipe horizontally to scrub, double-tap a side to jump 10 s. All gesture state lives in refs and
// Animated values, so a drag never re-renders the player; only the small HUD updates (10 Hz).
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Brightness from 'expo-brightness';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { colors } from '../theme/tokens';
import { formatClock } from '../utils/format';
import { Txt } from './Txt';

export interface GestureProps {
  /** Swipe gestures (brightness / volume / scrub) are active. */
  swipe: boolean;
  doubleTap: boolean;
  getTime: () => { position: number; duration: number };
  getVolume: () => number;
  setVolume: (v: number) => void;
  onTap: () => void;
  onSeekBy: (delta: number) => void;
  onSeekTo: (t: number) => void;
  onScrub: (t: number | null) => void;
}

type Hud = { kind: 'brightness' | 'volume' | 'seek'; text: string } | null;

const BAR_H = 150;
const TAP_MS = 350;
const DOUBLE_TAP_MS = 280;
const SCRUB_SECONDS_PER_WIDTH = 180;

export function PlayerGestures(props: GestureProps) {
  const P = useRef(props);
  P.current = props;

  const size = useRef({ w: 1, h: 1 });
  const level = useRef(new Animated.Value(0)).current;
  const [hud, setHud] = useState<Hud>(null);
  const hudHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudAt = useRef(0);
  const st = useRef({
    mode: 'none' as 'none' | 'h' | 'v' | 'ignore',
    side: 'brightness' as 'brightness' | 'volume',
    x0: 0,
    t0: 0,
    start: 0,
    startPos: 0,
    target: 0,
    smooth: 0,
    brightness: 0.5,
    brightnessAt: 0,
    lastTap: null as { half: 'l' | 'r'; at: number } | null,
    pendingTap: null as ReturnType<typeof setTimeout> | null,
  }).current;

  useEffect(() => {
    Brightness.getBrightnessAsync()
      .then((b) => {
        st.brightness = b;
      })
      .catch(() => undefined);
    return () => {
      Brightness.restoreSystemBrightnessAsync().catch(() => undefined);
      if (hudHide.current) clearTimeout(hudHide.current);
      if (st.pendingTap) clearTimeout(st.pendingTap);
    };
  }, [st]);

  const showHud = useCallback((next: NonNullable<Hud>, force = false) => {
    const now = Date.now();
    if (!force && now - hudAt.current < 90) return;
    hudAt.current = now;
    setHud(next);
    if (hudHide.current) clearTimeout(hudHide.current);
    hudHide.current = setTimeout(() => setHud(null), 900);
  }, []);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        st.mode = 'none';
        st.x0 = e.nativeEvent.pageX;
        st.t0 = Date.now();
      },
      onPanResponderMove: (_, g) => {
        const p = P.current;
        if (st.mode === 'none') {
          if (Math.hypot(g.dx, g.dy) < 10) return;
          if (!p.swipe) {
            st.mode = 'ignore';
            return;
          }
          const horizontal = Math.abs(g.dx) > Math.abs(g.dy) * 1.2;
          const time = p.getTime();
          if (horizontal) {
            if (time.duration <= 0) {
              st.mode = 'ignore';
              return;
            }
            st.mode = 'h';
            st.startPos = time.position;
          } else {
            st.mode = 'v';
            st.side = st.x0 < size.current.w / 2 ? 'brightness' : 'volume';
            st.start = st.side === 'brightness' ? st.brightness : p.getVolume();
            st.smooth = st.start;
          }
        }
        if (st.mode === 'h') {
          const { duration } = p.getTime();
          const delta = Math.round((g.dx / size.current.w) * SCRUB_SECONDS_PER_WIDTH);
          st.target = Math.max(0, Math.min(duration, st.startPos + delta));
          p.onScrub(st.target);
          showHud({ kind: 'seek', text: `${formatClock(st.target)}  (${delta >= 0 ? '+' : ''}${delta}s)` });
        } else if (st.mode === 'v') {
          const raw = Math.max(0, Math.min(1, st.start - g.dy / (size.current.h * 0.85)));
          // Light smoothing removes touch jitter without adding noticeable lag.
          st.smooth += (raw - st.smooth) * 0.55;
          const value = Math.abs(raw - st.smooth) < 0.004 ? raw : st.smooth;
          level.setValue(value);
          if (st.side === 'brightness') {
            st.brightness = Math.max(0.02, value);
            const now = Date.now();
            if (now - st.brightnessAt > 32) {
              st.brightnessAt = now;
              Brightness.setBrightnessAsync(st.brightness).catch(() => undefined);
            }
          } else {
            p.setVolume(value);
          }
          showHud({ kind: st.side, text: `${Math.round(value * 100)}%` });
        }
      },
      onPanResponderRelease: (e, g) => {
        const p = P.current;
        const mode = st.mode;
        st.mode = 'none';
        if (mode === 'h') {
          p.onScrub(null);
          p.onSeekTo(st.target);
          return;
        }
        if (mode === 'v') return;
        if (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10 || Date.now() - st.t0 > TAP_MS) return;
        const half: 'l' | 'r' = e.nativeEvent.pageX < size.current.w / 2 ? 'l' : 'r';
        const now = Date.now();
        if (p.doubleTap && st.lastTap && st.lastTap.half === half && now - st.lastTap.at < DOUBLE_TAP_MS) {
          if (st.pendingTap) clearTimeout(st.pendingTap);
          st.pendingTap = null;
          st.lastTap = { half, at: now };
          p.onSeekBy(half === 'l' ? -10 : 10);
          return;
        }
        st.lastTap = { half, at: now };
        if (st.pendingTap) clearTimeout(st.pendingTap);
        st.pendingTap = setTimeout(
          () => {
            st.pendingTap = null;
            P.current.onTap();
          },
          p.doubleTap ? DOUBLE_TAP_MS : 0,
        );
      },
      onPanResponderTerminate: () => {
        st.mode = 'none';
        P.current.onScrub(null);
      },
    }),
  ).current;

  const fill = level.interpolate({ inputRange: [0, 1], outputRange: [0, BAR_H] });

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        size.current = { w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) };
      }}
      {...responder.panHandlers}
    >
      {hud && hud.kind !== 'seek' ? (
        <View pointerEvents="none" style={[styles.side, hud.kind === 'brightness' ? { left: 36 } : { right: 36 }]}>
          <Ionicons name={hud.kind === 'brightness' ? 'sunny' : hud.text === '0%' ? 'volume-mute' : 'volume-high'} size={22} color={colors.text} />
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { height: fill }]} />
          </View>
          <Txt weight="bold" size={12}>{hud.text}</Txt>
        </View>
      ) : null}
      {hud && hud.kind === 'seek' ? (
        <View pointerEvents="none" style={styles.seek}>
          <Txt weight="bold" size={20}>{hud.text}</Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  side: {
    position: 'absolute',
    top: '50%',
    marginTop: -(BAR_H + 70) / 2,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 10,
  },
  track: { width: 6, height: BAR_H, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', justifyContent: 'flex-end', overflow: 'hidden' },
  fill: { width: 6, backgroundColor: colors.text },
  seek: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
