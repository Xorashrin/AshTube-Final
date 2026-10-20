import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { VodTitle } from '../data/vod';
import { colors, radius } from '../theme/tokens';
import { Txt } from './Txt';

export const VOD_POSTER = { width: 110, height: 160 } as const;

interface VodPosterProps {
  title: VodTitle;
  width?: number;
  height?: number;
  onPress?: (title: VodTitle) => void;
}

/**
 * VodPoster — uses the real poster URL from Cinemeta (TMDB image CDN).
 * No fake placeholder images. No reliance on the seed-based mock image URLs.
 */
export const VodPoster = memo(function VodPoster({
  title,
  width = VOD_POSTER.width,
  height = VOD_POSTER.height,
  onPress,
}: VodPosterProps) {
  const titleSize = Math.max(11, Math.round(width / 9));
  return (
    <Pressable
      onPress={onPress ? () => onPress(title) : undefined}
      style={({ pressed }) => [styles.frame, { width, height, opacity: pressed ? 0.85 : 1 }]}
    >
      {title.poster ? (
        <Image
          source={{ uri: title.poster }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={title.id}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: title.tint }]} />
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.92)']} locations={[0.4, 0.65, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.badgeRow}>
        <View style={styles.kindBadge}>
          <Txt weight="bold" size={8} color={colors.bg}>
            {title.kind === 'series' ? 'SERIES' : 'FILM'}
          </Txt>
        </View>
        {title.imdbRating ? (
          <View style={styles.ratingBadge}>
            <Txt weight="bold" size={9} color={colors.bg}>
              ★ {title.imdbRating}
            </Txt>
          </View>
        ) : null}
      </View>
      <View style={styles.caption}>
        <Txt weight="semibold" size={titleSize} numberOfLines={2}>
          {title.name}
        </Txt>
        <Txt size={9} color={colors.textSoft} style={{ marginTop: 2 }}>
          {title.year ? String(title.year) : title.category}
        </Txt>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  badgeRow: { position: 'absolute', top: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' },
  kindBadge: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  ratingBadge: { backgroundColor: '#F5A623', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  caption: { position: 'absolute', left: 6, right: 6, bottom: 6 },
});
