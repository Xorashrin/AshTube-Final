import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '../components/Txt';
import { GENRES, REGIONS } from '../data/types';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Categories'>;

type TabKind = 'types' | 'regions' | 'genres';

const CONTENT_TYPE_ITEMS = [
  { label: 'All Entertainment', type: 'all', desc: 'Movies and Series' },
  { label: 'Movies Only', type: 'movies', desc: 'Hollywood, Bollywood, Regional & International' },
  { label: 'TV & Web Series', type: 'tv', desc: 'Dramas, Series & Shows' },
  { label: 'Anime Discovery', type: 'anime', desc: 'Trending, Airing, Seasons & Genres' },
  { label: 'My List', type: 'mylist', desc: 'Saved titles & watchlist' },
  { label: '18+ Adult Content', type: 'adult', desc: 'Adult catalogs (PIN protected)' },
];

export default function CategoriesScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const current = route.params?.current ?? 'Home';
  const [activeTab, setActiveTab] = useState<TabKind>('types');

  const onSelectType = (item: (typeof CONTENT_TYPE_ITEMS)[number]) => {
    navigation.goBack();
    if (item.type === 'anime') {
      navigation.navigate('Main', { screen: 'Anime' });
    } else if (item.type === 'mylist') {
      navigation.navigate('MyList');
    } else if (item.type === 'adult') {
      navigation.navigate('AdultContent');
    } else if (item.type === 'movies') {
      navigation.navigate('Main', { screen: 'Home', params: { filter: 'movies', genre: undefined } });
    } else if (item.type === 'tv') {
      navigation.navigate('Main', { screen: 'Home', params: { filter: 'tv', genre: undefined } });
    } else {
      navigation.navigate('Main', { screen: 'Home', params: { filter: 'all', genre: undefined } });
    }
  };

  const onSelectRegion = (region: string) => {
    navigation.goBack();
    navigation.navigate('Main', { screen: 'Home', params: { genre: region, filter: 'all' } });
  };

  const onSelectGenre = (genre: string) => {
    navigation.goBack();
    navigation.navigate('Main', { screen: 'Home', params: { genre, filter: 'all' } });
  };

  return (
    <View style={styles.root}>
      {/* Category Tabs */}
      <View style={[styles.tabsWrap, { paddingTop: insets.top + 20 }]}>
        <View style={styles.tabsContainer}>
          <Pressable
            onPress={() => setActiveTab('types')}
            style={[styles.tabButton, activeTab === 'types' && styles.tabButtonActive]}
          >
            <Txt weight={activeTab === 'types' ? 'bold' : 'medium'} size={14} color={activeTab === 'types' ? colors.text : colors.textMuted}>
              Types
            </Txt>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('regions')}
            style={[styles.tabButton, activeTab === 'regions' && styles.tabButtonActive]}
          >
            <Txt weight={activeTab === 'regions' ? 'bold' : 'medium'} size={14} color={activeTab === 'regions' ? colors.text : colors.textMuted}>
              Regions
            </Txt>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('genres')}
            style={[styles.tabButton, activeTab === 'genres' && styles.tabButtonActive]}
          >
            <Txt weight={activeTab === 'genres' ? 'bold' : 'medium'} size={14} color={activeTab === 'genres' ? colors.text : colors.textMuted}>
              Genres
            </Txt>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        {activeTab === 'types' ? (
          <View style={styles.list}>
            {CONTENT_TYPE_ITEMS.map((item) => {
              const active = current === item.label;
              return (
                <Pressable
                  key={item.label}
                  onPress={() => onSelectType(item)}
                  style={({ pressed }) => [styles.itemCard, pressed && { opacity: 0.8 }]}
                >
                  <Txt weight={active ? 'bold' : 'semibold'} size={18} color={active ? colors.red : colors.text}>
                    {item.label}
                  </Txt>
                  <Txt size={12} color={colors.textDim} style={{ marginTop: 2 }}>
                    {item.desc}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        ) : activeTab === 'regions' ? (
          <View style={styles.list}>
            {REGIONS.map((region) => {
              const active = current === region;
              return (
                <Pressable
                  key={region}
                  onPress={() => onSelectRegion(region)}
                  style={({ pressed }) => [styles.itemCard, pressed && { opacity: 0.8 }]}
                >
                  <Txt weight={active ? 'bold' : 'medium'} size={18} color={active ? colors.red : colors.text}>
                    {region}
                  </Txt>
                  <Txt size={12} color={colors.textDim} style={{ marginTop: 2 }}>
                    {region} entertainment and releases
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.list}>
            {GENRES.map((genre) => {
              const active = current === genre;
              return (
                <Pressable
                  key={genre}
                  onPress={() => onSelectGenre(genre)}
                  style={({ pressed }) => [styles.itemCard, pressed && { opacity: 0.8 }]}
                >
                  <Txt weight={active ? 'bold' : 'medium'} size={18} color={active ? colors.red : colors.text}>
                    {genre}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating Close Button */}
      <View style={[styles.closeWrap, { bottom: insets.bottom + 28 }]}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.close, pressed && { opacity: 0.8 }]}>
          <Ionicons name="close" size={28} color="#000000" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  tabsWrap: { alignItems: 'center', marginBottom: 16 },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface4,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  tabButtonActive: {
    backgroundColor: colors.surface1,
  },
  content: { paddingHorizontal: 24, alignItems: 'center' },
  list: { width: '100%', maxWidth: 440, gap: 12 },
  itemCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.surface4,
  },
  closeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  close: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
});
