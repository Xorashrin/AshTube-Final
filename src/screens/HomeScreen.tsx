import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Billboard } from '../components/Billboard';
import { ChannelRow } from '../components/ChannelRow';
import { Chip } from '../components/Chip';
import { SheetItem } from '../components/ListItems';
import { ContinueRow, PosterRow, Top10Row, type ContinueItem } from '../components/Rows';
import { HeaderActions } from '../components/ScreenHeader';
import { Sheet } from '../components/Sheet';
import { TALL_POSTER } from '../components/Poster';
import { Txt } from '../components/Txt';
import { VodRow } from '../components/VodRow';
import { findEpisode, type Title } from '../data/mock';
import { resolveTitle, RESOLVED_TITLES } from '../data/resolveTitle';
import { moviesChannels, seriesChannels, newsChannels, sportsChannels, type Channel } from '../data/channels';
import { VOD_TITLES, vodByCategory, getVodTitle, type VodTitle } from '../data/vod';
import { useRootNav, type TabParamList } from '../navigation/types';
import { useApp, type ProfileData } from '../state/AppState';
import { colors, layout } from '../theme/tokens';
import { shade } from '../utils/color';

type Props = BottomTabScreenProps<TabParamList, 'Home'>;
type HomeFilter = 'all' | 'tv' | 'movies';

type HomeRow =
  | { key: string; kind: 'continue'; title: string; items: ContinueItem[] }
  | { key: string; kind: 'top10' | 'poster' | 'tall'; title: string; items: Title[] };

const GENRE_ROWS: Record<string, string> = {
  Thriller: 'Edge-of-Your-Seat Thrillers',
  'Sci-Fi': 'Mind-Bending Sci-Fi',
  Drama: 'Award-Winning Dramas',
  Fantasy: 'Epic Fantasy Worlds',
  Crime: 'Crime TV & Movies',
  Comedy: 'Laugh-Out-Loud Comedies',
  Horror: 'Scary Good Horror',
  Sports: 'Sports Stories',
  Kids: 'Kids & Family Favorites',
};

const MAIN_TITLES = RESOLVED_TITLES.filter((t) => !t.id.startsWith('xv-') && !(t.genres || []).includes('Adult'));
const HERO_MOVIE = MAIN_TITLES.find((t) => t.kind === 'movie') ?? MAIN_TITLES[0];
const HERO_SERIES = MAIN_TITLES.find((t) => t.kind === 'series') ?? MAIN_TITLES[1] ?? MAIN_TITLES[0];

function rotate<T>(list: T[], by: number): T[] {
  if (list.length === 0) return list;
  const n = by % list.length;
  return [...list.slice(n), ...list.slice(0, n)];
}

function buildRows(filter: HomeFilter, genre: string | undefined, data: ProfileData, name: string): HomeRow[] {
  const pool = MAIN_TITLES.filter(
    (t) => (filter === 'all' || (filter === 'tv' ? t.kind === 'series' : t.kind === 'movie')) && (!genre || (t.genres || []).includes(genre)),
  );
  const inPool = (t: Title) => pool.some((p) => p.id === t.id);
  const rows: HomeRow[] = [];

  const continueItems: ContinueItem[] = data.progress
    .map((entry) => {
      const title = resolveTitle(entry.titleId);
      const ep = entry.episodeId ? findEpisode(title, entry.episodeId) : null;
      return { title, entry, label: ep ? `S${ep.season.number}:E${ep.episode.number}` : undefined };
    })
    .filter((i) => inPool(i.title));
  if (continueItems.length > 0) rows.push({ key: 'continue', kind: 'continue', title: `Continue Watching for ${name}`, items: continueItems });

  const originals = pool.filter((t) => t.original);
  if (originals.length > 0) rows.push({ key: 'originals', kind: 'tall', title: 'Only on MythTube', items: originals });

  if (!genre) {
    const movies = filter === 'movies';
    const topMovies = pool.filter((t) => t.kind === 'movie').slice(0, 10);
    const topSeries = pool.filter((t) => t.kind === 'series').slice(0, 10);
    rows.push({
      key: 'top10',
      kind: 'top10',
      title: movies ? 'Top 10 Movies Today' : 'Top 10 Series Today',
      items: movies ? topMovies : topSeries,
    });
  }

  rows.push({ key: 'trending', kind: 'poster', title: 'Trending Now', items: rotate(pool, 3) });

  const myList = data.myList.map(resolveTitle).filter(inPool);
  if (myList.length > 0) rows.push({ key: 'mylist', kind: 'poster', title: 'My List', items: myList });

  const fresh = pool.filter((t) => t.badge || t.year >= 2024);
  if (fresh.length > 0) rows.push({ key: 'new', kind: 'poster', title: 'New on MythTube', items: fresh });

  Object.entries(GENRE_ROWS).forEach(([g, label]) => {
    if (genre && g === genre) return;
    const items = pool.filter((t) => t.genres.includes(g));
    if (items.length >= 3) rows.push({ key: `genre-${g}`, kind: 'poster', title: label, items });
  });

  if (filter === 'all' && !genre) {
    const topMovies = pool.filter((t) => t.kind === 'movie').slice(0, 10);
    if (topMovies.length > 0) {
      rows.push({ key: 'top10-movies', kind: 'top10', title: 'Top 10 Movies Today', items: topMovies });
    }
  }
  rows.push({ key: 'love', kind: 'poster', title: "We Think You'll Love These", items: [...pool].reverse() });
  return rows;
}

export default function HomeScreen({ route, navigation }: Props) {
  const nav = useRootNav();
  const insets = useSafeAreaInsets();
  const { activeProfile, profileData, toggleMyList, rate, removeProgress, showToast } = useApp();
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [menuItem, setMenuItem] = useState<ContinueItem | null>(null);
  const genre = route.params?.genre;
  const name = activeProfile?.name ?? 'You';

  const rows = useMemo(() => buildRows(filter, genre, profileData, name), [filter, genre, profileData, name]);
  const hero = useMemo(() => {
    if (filter === 'movies') return HERO_MOVIE;
    if (filter === 'tv') return HERO_SERIES;
    if (genre) {
      const match = RESOLVED_TITLES.find((t) => t.genres.includes(genre));
      if (match) return match;
    }
    return RESOLVED_TITLES[0] ?? HERO_MOVIE;
  }, [filter, genre]);

  const scrollY = useSharedValue(0);
  const lastY = useSharedValue(0);
  const chipOffset = useSharedValue(0);

  useEffect(() => {
    scrollY.value = 0;
    lastY.value = 0;
    chipOffset.value = 0;
  }, [filter, genre, scrollY, lastY, chipOffset]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const dy = y - lastY.value;
      lastY.value = y;
      scrollY.value = y;
      chipOffset.value = y <= 0 ? 0 : Math.min(layout.chipRowHeight, Math.max(0, chipOffset.value + dy));
    },
  });

  const headerTop = insets.top + layout.headerHeight;
  const headerStyle = useAnimatedStyle(() => ({ height: headerTop + layout.chipRowHeight - chipOffset.value }));
  const headerBgStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 160], [0, 0.97], Extrapolation.CLAMP) }));
  const chipsStyle = useAnimatedStyle(() => ({
    opacity: 1 - chipOffset.value / layout.chipRowHeight,
    transform: [{ translateY: -chipOffset.value }],
  }));

  const openTitle = useCallback((t: Title) => nav.navigate('Title', { id: t.id }), [nav]);
  const playContinue = useCallback((i: ContinueItem) => nav.navigate('Player', { id: i.title.id, episodeId: i.entry.episodeId }), [nav]);
  const openChannel = useCallback((c: Channel) => nav.navigate('Live', { channelId: c.id, filter: 'All' }), [nav]);
  // Real VOD backend (requirement 9) — every title below is real, scraped from
  // Stremio Cinemeta catalog with TMDB-backed posters + multi-source streams.
  // No fake demo titles anymore.
  const vodMovies = useMemo(() => vodByCategory('Movies', 18), []);
  const vodSeries = useMemo(() => vodByCategory('Series', 18), []);
  const vodAnime = useMemo(() => vodByCategory('Anime', 18), []);
  const vodCartoon = useMemo(() => vodByCategory('Cartoon', 18), []);
  const vodKids = useMemo(() => vodByCategory('Kids', 18), []);
  const vodSciFi = useMemo(() => vodByCategory('Sci-Fi', 18), []);
  const vodDoc = useMemo(() => vodByCategory('Documentary', 18), []);
  const openVod = useCallback(
    (t: VodTitle) => nav.navigate('Title', { id: t.id }),
    [nav],
  );
  const liveMovies = useMemo(() => moviesChannels(20), []);
  const liveSeries = useMemo(() => seriesChannels(15), []);
  const liveNews = useMemo(() => newsChannels(15), []);
  const liveSports = useMemo(() => sportsChannels(15), []);
  const clearFilters = () => {
    setFilter('all');
    navigation.setParams({ genre: undefined });
  };

  const filterLabel = filter === 'tv' ? 'TV Shows' : filter === 'movies' ? 'Movies' : undefined;
  const heading = filterLabel ?? genre ?? `For ${name}`;
  const inMyList = profileData.myList.includes(hero.id);

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        key={`${filter}-${genre ?? ''}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: headerTop + layout.chipRowHeight + 4, paddingBottom: 32 }}
      >
        <LinearGradient
          colors={[shade(hero.tint, 0.1), shade(hero.tint, 0.55), colors.bg]}
          locations={[0, 0.5, 1]}
          style={[styles.tint, { height: headerTop + 820 }]}
        />
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
        {rows.map((row) => {
          switch (row.kind) {
            case 'continue':
              return <ContinueRow key={row.key} title={row.title} items={row.items} onPlay={playContinue} onInfo={openTitle} onMore={setMenuItem} />;
            case 'top10':
              return <Top10Row key={row.key} title={row.title} items={row.items} onPressTitle={openTitle} />;
            case 'tall':
              return <PosterRow key={row.key} title={row.title} items={row.items} onPressTitle={openTitle} width={TALL_POSTER.width} height={TALL_POSTER.height} />;
            default:
              return (
                <PosterRow
                  key={row.key}
                  title={row.title}
                  items={row.items}
                  onPressTitle={openTitle}
                  onSeeAll={row.key === 'mylist' ? () => nav.navigate('MyList') : undefined}
                />
              );
          }
        })}
        {/* Real VOD backend — every title below is real, with real posters */}
        <VodRow title="🔥 Trending Movies" items={vodMovies} onPressTitle={openVod} />
        <VodRow title="📺 Trending Series" items={vodSeries} onPressTitle={openVod} />
        <VodRow title="🚀 Sci-Fi Picks" items={vodSciFi} onPressTitle={openVod} />
        <VodRow title="🎨 Cartoons" items={vodCartoon} onPressTitle={openVod} />
        <VodRow title="✨ Anime" items={vodAnime} onPressTitle={openVod} />
        <VodRow title="👨‍👩‍👧 Kids & Family" items={vodKids} onPressTitle={openVod} />
        <VodRow title="🎬 Documentaries" items={vodDoc} onPressTitle={openVod} />

        {/* Real IPTV backend — live channels parsed from scraped data */}
        <ChannelRow title="🔴 Live Movie Channels" items={liveMovies} onPressChannel={openChannel} />
        <ChannelRow title="🔴 Live Series Channels" items={liveSeries} onPressChannel={openChannel} />
        <ChannelRow title="🔴 Live News Channels" items={liveNews} onPressChannel={openChannel} onSeeAll={() => nav.navigate('Notifications')} />
        <ChannelRow title="🔴 Live Sports Channels" items={liveSports} onPressChannel={openChannel} onSeeAll={() => nav.navigate('Main', { screen: 'TV' } as any)} />
      </Animated.ScrollView>

      <Animated.View style={[styles.header, headerStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: shade(hero.tint, 0.6) }, headerBgStyle]} />
        <View style={[styles.headerRow, { marginTop: insets.top }]}>
          <Txt weight="bold" size={22} numberOfLines={1} style={{ flex: 1 }}>
            {heading}
          </Txt>
          <HeaderActions actions={['downloads', 'search']} />
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
      </Animated.View>

      <Sheet visible={menuItem !== null} onClose={() => setMenuItem(null)}>
        {menuItem ? (
          <>
            <Txt weight="bold" size={16} style={styles.sheetTitle} numberOfLines={1}>
              {menuItem.title.name}
              {menuItem.label ? `  ${menuItem.label}` : ''}
            </Txt>
            <SheetItem label="Episodes & Info" icon="information-circle-outline" onPress={() => { setMenuItem(null); openTitle(menuItem.title); }} />
            <SheetItem label="Not for me" icon="thumbs-down-outline" onPress={() => { rate(menuItem.title.id, 'down'); setMenuItem(null); showToast("We won't suggest this again."); }} />
            <SheetItem label="I like this" icon="thumbs-up-outline" onPress={() => { rate(menuItem.title.id, 'up'); setMenuItem(null); showToast("You'll see more like this."); }} />
            <SheetItem label="Love this!" icon="heart-outline" onPress={() => { rate(menuItem.title.id, 'love'); setMenuItem(null); showToast('We know you’re a true fan!'); }} />
            <SheetItem label="Remove From Row" icon="close-circle-outline" destructive onPress={() => { removeProgress(menuItem.title.id); setMenuItem(null); showToast('Removed from Continue Watching'); }} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tint: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  headerRow: { height: layout.headerHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter + 4 },
  chips: { height: layout.chipRowHeight, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layout.gutter + 4 },
  sheetTitle: { paddingHorizontal: 20, paddingVertical: 10 },
});
