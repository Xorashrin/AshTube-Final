import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type ListRenderItem } from 'react-native';

import { Billboard } from '../components/Billboard';
import { Chip } from '../components/Chip';
import { Poster } from '../components/Poster';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import type { Title } from '../data/types';
import { useRootNav } from '../navigation/types';
import { ANIME_GENRES, loadAnimeFeed } from '../services/catalog';
import { warmUp } from '../services/playback';
import { useApp } from '../state/AppState';
import { colors, layout } from '../theme/tokens';

const ANIME_CATEGORIES = [
  'All',
  'Popular Anime',
  'Trending Anime',
  'Recently Released',
  'Ongoing Anime',
  'Completed Anime',
  'Anime Movies',
  'Anime Series',
  'Top Rated',
  'This Season',
  'Next Season',
  'Classic Anime',
  'Donghua',
  ...ANIME_GENRES,
] as const;

export default function AnimeScreen() {
  const nav = useRootNav();
  const { width } = useWindowDimensions();
  const { profileData, toggleMyList, showToast } = useApp();
  const [selectedCat, setSelectedCat] = useState<string>('All');
  const [items, setItems] = useState<Title[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const cell = Math.floor((width - layout.gutter * 2 - 16) / 3);
  const openTitle = useCallback((t: Title) => nav.navigate('Title', { id: t.id }), [nav]);

  const seenIds = useRef(new Set<string>());
  const loadingRef = useRef(false);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const isGenre = (cat: string) => (ANIME_GENRES as readonly string[]).includes(cat);

  const loadPage = useCallback(
    async (p: number, reset = false) => {
      if (loadingRef.current || (done && !reset)) return;
      loadingRef.current = true;
      setLoading(true);
      setError(false);

      if (abortCtrlRef.current) abortCtrlRef.current.abort();
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      try {
        const genreParam = isGenre(selectedCat) ? selectedCat : undefined;
        const catParam = isGenre(selectedCat) ? 'popular' : selectedCat;
        const { items: batch, hasNextPage } = await loadAnimeFeed({
          page: p,
          category: catParam,
          genre: genreParam,
          signal: ctrl.signal,
        });

        if (ctrl.signal.aborted) return;

        if (reset) {
          seenIds.current.clear();
          const unique: Title[] = [];
          for (const item of batch) {
            if (!seenIds.current.has(item.id)) {
              seenIds.current.add(item.id);
              unique.push(item);
            }
          }
          setItems(unique);
          setPage(2);
          setDone(!hasNextPage || unique.length === 0);
        } else {
          const fresh: Title[] = [];
          for (const item of batch) {
            if (!seenIds.current.has(item.id)) {
              seenIds.current.add(item.id);
              fresh.push(item);
            }
          }
          if (fresh.length === 0 && !hasNextPage) {
            setDone(true);
          } else {
            setItems((prev) => [...prev, ...fresh]);
            setPage(p + 1);
            setDone(!hasNextPage);
          }
        }
      } catch {
        if (!ctrl.signal.aborted) setError(true);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedCat, done],
  );

  useEffect(() => {
    setDone(false);
    setError(false);
    loadPage(1, true);
    return () => {
      if (abortCtrlRef.current) abortCtrlRef.current.abort();
    };
  }, [selectedCat]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setDone(false);
    loadPage(1, true);
  }, [loadPage]);

  const hero = useMemo(() => {
    return items.find((t) => (t.background || t.poster) && t.badge) ?? items[0] ?? null;
  }, [items]);

  useEffect(() => {
    if (hero) warmUp(hero);
  }, [hero?.id]);

  const renderItem = useCallback<ListRenderItem<Title>>(
    ({ item }) => (
      <View style={{ width: cell }}>
        <Poster title={item} width={cell} height={Math.round(cell * 1.45)} onPress={openTitle} showTitle />
      </View>
    ),
    [cell, openTitle],
  );

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {ANIME_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            selected={selectedCat === cat}
            solid
            onPress={() => setSelectedCat(cat)}
          />
        ))}
      </ScrollView>
      {hero && selectedCat === 'All' ? (
        <Billboard
          title={hero}
          inMyList={profileData.myList.includes(hero.id)}
          onOpen={() => openTitle(hero)}
          onPlay={() => nav.navigate('Title', { id: hero.id })}
          onToggleList={() => {
            toggleMyList(hero.id);
            showToast(profileData.myList.includes(hero.id) ? 'Removed from My List' : 'Added to My List');
          }}
        />
      ) : null}
      <View style={styles.sectionHeader}>
        <Txt weight="bold" size={18}>
          {selectedCat === 'All' ? 'Anime Discovery' : `${selectedCat} Anime`}
        </Txt>
      </View>
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {loading ? (
        <View style={styles.loadingFooter}>
          <ActivityIndicator color={colors.red} size="small" />
          <Txt size={13} color={colors.textMuted} style={{ marginTop: 8 }}>
            Loading more anime…
          </Txt>
        </View>
      ) : done ? (
        <Txt size={13} color={colors.textDim} align="center" style={{ paddingVertical: 18 }}>
          End of feed · All available titles loaded
        </Txt>
      ) : error ? (
        <Pressable onPress={() => loadPage(page, false)} style={styles.retryWrap}>
          <Txt size={14} color={colors.red} align="center">
            Couldn’t load more anime. Tap to retry.
          </Txt>
        </Pressable>
      ) : (
        <View style={{ height: 32 }} />
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="Anime" actions={['downloads', 'search']} searchScope={{ kind: 'anime' }} />
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        onEndReached={() => loadPage(page, false)}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  chips: { gap: 8, paddingHorizontal: layout.gutter, paddingVertical: 10 },
  sectionHeader: { paddingHorizontal: layout.gutter, marginTop: 14, marginBottom: 10 },
  grid: { paddingBottom: 40 },
  gridRow: { gap: 8, paddingHorizontal: layout.gutter, marginBottom: 14 },
  footer: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  loadingFooter: { alignItems: 'center', paddingVertical: 12 },
  retryWrap: { padding: 14, alignItems: 'center' },
});
