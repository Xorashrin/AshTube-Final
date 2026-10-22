import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Billboard } from '../components/Billboard';
import { Chip } from '../components/Chip';
import { PosterRow, SkeletonRow } from '../components/Rows';
import { HeaderActions } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import type { Title } from '../data/types';
import { HOME_ROWS, resolveTitle, useFeedRows, useRows, type RowState } from '../services/catalog';
import { warmUp } from '../services/playback';
import { useRootNav, type TabParamList } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, layout } from '../theme/tokens';
import { shade } from '../utils/color';

import { isAnime, isKDrama, isLiveTV } from '../services/classifier';

type Props = BottomTabScreenProps<TabParamList, 'Home'>;
type HomeFilter = 'all' | 'tv' | 'movies';

type Section =
  | { key: string; kind: 'hero' }
  | { key: string; kind: 'row'; title: string; items: Title[]; loading: boolean; seeAll?: () => void };

const match = (t: Title, filter: HomeFilter, genre?: string) =>
  !isAnime(t) &&
  !isKDrama(t) &&
  !isLiveTV(t) &&
  !t.nsfw &&
  (t.kind === 'movie' || t.kind === 'series') &&
  (filter === 'all' || (filter === 'tv' ? t.kind === 'series' : t.kind === 'movie')) &&
  (!genre || t.genres.some((g) => g.toLowerCase() === genre.toLowerCase()));

/** Home: one billboard, your rows, then an endless feed that keeps adding genres and categories as you scroll. */
export default function HomeScreen({ route, navigation }: Props) {
  const nav = useRootNav();
  const insets = useSafeAreaInsets();
  const { profileData, toggleMyList, showToast } = useApp();
  const [filter, setFilter] = useState<HomeFilter>(route.params?.filter ?? 'all');
  const genre = route.params?.genre;

  useEffect(() => {
    if (route.params?.filter) {
      setFilter(route.params.filter);
    }
  }, [route.params?.filter]);

  const { rows: baseRows, refresh, refreshing } = useRows(HOME_ROWS);
  const feed = useFeedRows();

  // Start the endless feed as soon as the first rows are on screen.
  useEffect(() => {
    feed.more(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Item arrays keep their identity while nothing changed, so untouched rows never re-render.
  const filtered = useRef(new Map<string, { src: Title[]; key: string; out: Title[] }>()).current;
  const applyFilter = useCallback(
    (r: RowState): RowState => {
      const key = `${filter}|${genre ?? ''}`;
      const hit = filtered.get(r.def.key);
      if (hit && hit.src === r.items && hit.key === key) return { ...r, items: hit.out };
      const out = r.items.filter((t) => match(t, filter, genre));
      filtered.set(r.def.key, { src: r.items, key, out });
      return { ...r, items: out };
    },
    [filter, genre, filtered],
  );

  const rows = useMemo(() => [...baseRows, ...feed.rows].map(applyFilter).filter((r) => r.loading || r.items.length > 0), [baseRows, feed.rows, applyFilter]);

  const hero = useMemo<Title | null>(() => {
    const pool = rows.flatMap((r) => r.items).filter((t) => (t.background || t.poster) && t.source !== 'anilist');
    return pool.find((t) => t.imdbRating && t.badge) ?? pool.find((t) => t.imdbRating) ?? pool[0] ?? null;
  }, [rows]);

  // Find the best server for the featured title in the background so Play starts instantly.
  useEffect(() => {
    if (hero) warmUp(hero);
  }, [hero?.id]);

  const myListItems = useMemo(
    () => profileData.myList.map(resolveTitle).filter((t) => t.name !== 'Unavailable title' && match(t, filter, genre)),
    [profileData.myList, filter, genre],
  );

  const openTitle = useCallback((t: Title) => nav.navigate('Title', { id: t.id }), [nav]);

  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [{ key: 'hero', kind: 'hero' }];
    if (myListItems.length > 0) list.push({ key: 'mylist', kind: 'row', title: 'My List', items: myListItems, loading: false, seeAll: () => nav.navigate('MyList') });
    for (const r of rows) list.push({ key: r.def.key, kind: 'row', title: r.def.title, items: r.items, loading: r.loading });
    return list;
  }, [myListItems, rows, nav]);

  const scrollY = useRef(new Animated.Value(0)).current;
  // The chip row slides away as you scroll down and returns on any upward scroll.
  const chipOffset = useRef(Animated.diffClamp(scrollY, 0, layout.chipRowHeight)).current;

  useEffect(() => {
    scrollY.setValue(0);
  }, [filter, genre, scrollY]);

  const onScroll = useRef(Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })).current;

  const headerTop = insets.top + layout.headerHeight;
  const headerBgStyle = { opacity: scrollY.interpolate({ inputRange: [0, 160], outputRange: [0, 0.97], extrapolate: 'clamp' }) };
  const chipsStyle = {
    opacity: chipOffset.interpolate({ inputRange: [0, layout.chipRowHeight], outputRange: [1, 0] }),
    transform: [{ translateY: chipOffset.interpolate({ inputRange: [0, layout.chipRowHeight], outputRange: [0, -layout.chipRowHeight] }) }],
  };

  // Hardware back first clears an active filter or category instead of leaving the app.
  useFocusEffect(
    useCallback(() => {
      if (filter === 'all' && !genre) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setFilter('all');
        navigation.setParams({ genre: undefined });
        return true;
      });
      return () => sub.remove();
    }, [filter, genre, navigation]),
  );

  const clearFilters = () => {
    setFilter('all');
    navigation.setParams({ genre: undefined });
  };

  const filterLabel = filter === 'tv' ? 'TV Shows' : filter === 'movies' ? 'Movies' : undefined;
  const heading = filterLabel ?? genre ?? 'Home';
  const inMyList = hero ? profileData.myList.includes(hero.id) : false;
  const tint = hero?.tint ?? '#1A1A1A';

  const renderItem = useCallback(
    ({ item }: { item: Section }) => {
      switch (item.kind) {
        case 'hero':
          return hero ? (
            <Billboard
              title={hero}
              inMyList={inMyList}
              onOpen={() => openTitle(hero)}
              onPlay={() => nav.navigate('Player', { id: hero.id })}
              onToggleList={() => {
                toggleMyList(hero.id);
                showToast(inMyList ? 'Removed from My List' : 'Added to My List');
              }}
            />
          ) : (
            <View style={styles.heroSkeleton} />
          );
        default:
          return item.items.length === 0 ? <SkeletonRow title={item.title} /> : <PosterRow title={item.title} items={item.items} onPressTitle={openTitle} onSeeAll={item.seeAll} />;
      }
    },
    [hero, inMyList, nav, openTitle, showToast, toggleMyList],
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={[shade(tint, 0.1), shade(tint, 0.55), colors.bg]} locations={[0, 0.5, 1]} style={[styles.tint, { height: headerTop + 820 }]} pointerEvents="none" />
      <Animated.FlatList
        key={`${filter}-${genre ?? ''}`}
        data={sections}
        keyExtractor={(s) => s.key}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={7}
        removeClippedSubviews
        onEndReachedThreshold={1.6}
        onEndReached={() => feed.more(3)}
        contentContainerStyle={{ paddingTop: headerTop + layout.chipRowHeight + 4, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text} progressViewOffset={headerTop + layout.chipRowHeight} />}
        ListFooterComponent={<SkeletonRow title="Loading more…" />}
      />

      <View pointerEvents="box-none" style={[styles.header, { height: headerTop + layout.chipRowHeight }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: shade(tint, 0.6) }, headerBgStyle]} />
        <View style={[styles.headerRow, { marginTop: insets.top }]}>
          <Txt weight="bold" size={22} numberOfLines={1} style={{ flex: 1 }}>
            {heading}
          </Txt>
          <HeaderActions actions={['search']} searchScope={{ genre, kind: filter === 'tv' ? 'series' : filter === 'movies' ? 'movie' : undefined }} />
        </View>
        <Animated.View style={[styles.chips, chipsStyle]}>
          {filter === 'all' && !genre ? (
            <>
              <Chip label="TV Shows" onPress={() => setFilter('tv')} />
              <Chip label="Movies" onPress={() => setFilter('movies')} />
              <Chip label="Categories" caret onPress={() => nav.navigate('Categories', { current: genre })} />
            </>
          ) : (
            <>
              <Chip icon="close" onPress={clearFilters} />
              {filterLabel ? <Chip label={filterLabel} selected /> : null}
              <Chip label={genre ?? 'All Categories'} caret selected={!!genre} onPress={() => nav.navigate('Categories', { current: genre })} />
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tint: { position: 'absolute', top: 0, left: 0, right: 0 },
  heroSkeleton: { height: 420, marginHorizontal: 16, borderRadius: 12, backgroundColor: colors.surface2 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  headerRow: { height: layout.headerHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter + 4 },
  chips: { height: layout.chipRowHeight, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layout.gutter + 4 },
  sheetTitle: { paddingHorizontal: 20, paddingVertical: 10 },
});
