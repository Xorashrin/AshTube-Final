import React, { memo } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { Profile } from '../data/mock';
import { font } from '../theme/tokens';

interface AvatarProps {
  profile: Pick<Profile, 'id' | 'color' | 'kids'>;
  size: number;
  radius?: number;
}

export const Avatar = memo(function Avatar({ profile, size, radius = 4 }: AvatarProps) {
  const rx = (radius / size) * 100;
  if (profile.kids) {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`kids-${profile.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FF6A3D" />
            <Stop offset="0.5" stopColor="#E5B80B" />
            <Stop offset="1" stopColor="#2D6CDF" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" rx={rx} fill={`url(#kids-${profile.id})`} />
        <SvgText x="50" y="60" fontSize="30" fontFamily={font.black} fill="#FFFFFF" textAnchor="middle">
          kids
        </SvgText>
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width="100" height="100" rx={rx} fill={profile.color} />
      <Circle cx="34" cy="40" r="6" fill="#FFFFFF" />
      <Circle cx="66" cy="40" r="6" fill="#FFFFFF" />
      <Path d="M28 60 Q50 80 72 60" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" fill="none" />
    </Svg>
  );
});
