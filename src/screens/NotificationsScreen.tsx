import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ChannelLogo } from '../components/ChannelLogo';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import { img } from '../data/images';
import { NOTIFICATIONS } from '../data/mock';
import { resolveTitle } from '../data/resolveTitle';
import { newsChannels, type Channel } from '../data/channels';
import type { RootStackParamList } from '../navigation/types';
import { colors, layout, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

/**
 * News screen (route name "Notifications" for back-compat).
 *
 * Real backend (requirement 9): the top of this screen is a horizontal
 * scroller of IPTV News channels parsed straight from channels.json — i.e.
 * the scraped + validated streams. Below that, the old mock
 * notifications are preserved for the demo.
 */
export default function NotificationsScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const news = useMemo(() => newsChannels(60), []);
  const tile = Math.min(160, Math.floor((width - layout.gutter * 2 - 8 * 3) / 4));

  const openChannel = (c: Channel) =>
    navigation.navigate('Live', { channelId: c.id, filter: 'News' });

  return (
    <View style={styles.root}>
      <ScreenHeader title="News" back />
      <FlatList
        ListHeaderComponent={
          <View>
            <View style={styles.sectionHeader}>
              <Txt weight="bold" size={18}>Live News Channels</Txt>
              <Txt size={12} color={colors.textDim} style={{ marginTop: 4 }}>
                Real IPTV streams · {news.length} channels
              </Txt>
            </View>
            <FlatList
              horizontal
              data={news}
              keyExtractor={(c) => c.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.newsRow}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openChannel(item)}
                  style={({ pressed }) => [{ width: tile }, pressed ? { opacity: 0.7 } : null]}
                >
                  <ChannelLogo channel={item} size={tile} />
                  <Txt weight="medium" size={11} numberOfLines={2} style={{ marginTop: 6 }}>
                    {item.name}
                  </Txt>
                  <View style={styles.meta}>
                    <View style={styles.liveDot} />
                    <Txt size={9} color={colors.textDim} numberOfLines={1}>
                      {item.country}
                      {item.quality ? ` • ${item.quality}` : ''}
                    </Txt>
                  </View>
                </Pressable>
              )}
            />
            <View style={styles.sectionHeader}>
              <Txt weight="bold" size={18}>Notifications</Txt>
            </View>
          </View>
        }
        data={NOTIFICATIONS}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingBottom: 30 }}
        renderItem={({ item, index }) => {
          const title = resolveTitle(item.titleId);
          const thumbUri = title.background || title.poster || img.backdrop(title.seed);
          return (
            <Pressable
              onPress={() => navigation.navigate('Title', { id: title.id })}
              style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surface1 } : null]}
            >
              <View style={[styles.dot, index > 1 ? { backgroundColor: 'transparent' } : null]} />
              <View style={styles.thumb}>
                <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Txt size={13} color={colors.textMuted}>
                  {item.kicker}
                </Txt>
                <Txt weight="semibold" size={15} numberOfLines={2} style={{ marginTop: 2 }}>
                  {item.text}
                </Txt>
                <Txt size={12} color={colors.textDim} style={{ marginTop: 4 }}>
                  {item.date}
                </Txt>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  sectionHeader: { paddingHorizontal: layout.gutter, paddingTop: 18, paddingBottom: 12 },
  newsRow: { paddingHorizontal: layout.gutter, gap: 10, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red, marginRight: 12 },
  thumb: { width: 120, height: 68, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.red, marginRight: 4 },
});
