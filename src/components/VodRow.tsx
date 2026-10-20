import React, { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RowHeader } from './Rows';
import { Txt } from './Txt';
import { VodPoster, VOD_POSTER } from './VodPoster';
import type { VodTitle } from '../data/vod';
import { colors, layout } from '../theme/tokens';

interface VodRowProps {
  title: string;
  items: VodTitle[];
  onPressTitle: (t: VodTitle) => void;
  onSeeAll?: () => void;
}

/**
 * Horizontal scroller showing real VOD titles (movies / series / anime / cartoons).
 * Uses real poster URLs from Cinemeta. No fake images.
 */
export const VodRow = memo(function VodRow({ title, items, onPressTitle, onSeeAll }: VodRowProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <RowHeader title={title} onSeeAll={onSeeAll} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((t) => (
          <View key={t.id} style={styles.tile}>
            <VodPoster title={t} onPress={onPressTitle} />
            <Txt size={10} color={colors.textDim} numberOfLines={1} style={styles.meta}>
              {t.genres[0] ? t.genres[0] : t.category}
            </Txt>
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: 24 },
  row: { paddingHorizontal: layout.gutter, gap: 8 },
  tile: { width: VOD_POSTER.width, marginRight: 2 },
  meta: { marginTop: 6, textAlign: 'center' },
});
