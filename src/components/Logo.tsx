import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/tokens';
import { Txt } from './Txt';

const BAR = '#B1060F';
const W = 432;
const H = 624;
const BAR_W = 104;

export function ALogo({ size = 28 }: { size?: number }) {
  const s = size / H;
  const legLen = Math.hypot(150, H);
  const legAngle = (Math.atan2(150, H) * 180) / Math.PI;
  return (
    <View style={{ width: W * s, height: H * s, overflow: 'hidden' }}>
      {/* Left diagonal leg */}
      <View
        style={{
          position: 'absolute',
          width: BAR_W * s,
          height: legLen * s,
          left: (W / 2 - 40) * s - (BAR_W * s) / 2,
          top: (H / 2) * s - (legLen * s) / 2,
          backgroundColor: BAR,
          transform: [{ rotate: `${legAngle}deg` }],
        }}
      />
      {/* Right diagonal leg (crimson foreground ribbon) */}
      <View
        style={{
          position: 'absolute',
          width: BAR_W * s,
          height: legLen * s,
          left: (W / 2 + 40) * s - (BAR_W * s) / 2,
          top: (H / 2) * s - (legLen * s) / 2,
          backgroundColor: colors.red,
          transform: [{ rotate: `-${legAngle}deg` }],
        }}
      />
      {/* Horizontal ribbon crossbar */}
      <View
        style={{
          position: 'absolute',
          left: 80 * s,
          top: 380 * s,
          width: (W - 160) * s,
          height: 64 * s,
          backgroundColor: colors.red,
          borderRadius: 2 * s,
        }}
      />
    </View>
  );
}

/** Backward compatibility alias for MLogo */
export const MLogo = ALogo;

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <View>
      <Txt weight="display" size={size} color={colors.red} spacing={1.5} lineHeight={size * 1.05}>
        ASHTUBE
      </Txt>
    </View>
  );
}
