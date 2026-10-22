import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChannelLogo } from '../components/ChannelLogo';
import { Image } from '../components/Img';
import { categoryOf, Poster } from '../components/Poster';
import { Txt } from '../components/Txt';
import { searchChannels } from '../data/channels';
import { findEpisode, type Title } from '../data/types';
import type { RootStackParamList } from '../navigation/types';
import { ANIME_ROWS, getCachedSearch, loadDetail, rowsByKey, searchAll, useRows } from '../services/catalog';
import { isAnime, isKDrama, isGeneralMovie, isGeneralSeries, matchSearchCategory, type SearchCategory } from '../services/classifier';
import { warmUp } from '../services/playback';
import { addHistory, clearHistory, getHistory, parseQuery, removeHistory, suggest, type Suggestion } from '../services/searchTools';
import { colors, font, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

const CATEGORY_TABS: { key: SearchCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'series', label: 'Series' },
  { key: 'anime', label: 'Anime' },
  { key: 'kdrama', label: 'K-Drama' },
];

const RECOMMENDED_ROWS = rowsByKey('cm-series', 'cm-movies');
const ANIME_RECOMMENDED = ANIME_ROWS.slice(1, 3);

export default function SearchScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scope = route.params;
  const [category, setCategory] = useState<SearchCategory>((scope?.kind as SearchCategory) || 'all');
  const [query, setQuery] = useState('');
  // Typing stays responsive; network search runs on the debounced value.
  const deferred = useDeferredValue(query);
  const [rawResults, setRawResults] = useState<Title[]>([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [focused, setFocused] = useState(true);
  const { rows } = useRows(category === 'anime' ? ANIME_RECOMMENDED : RECOMMENDED_ROWS);

  const parsed = useMemo(() => parseQuery(deferred), [deferred]);
  const scopeLabel = scope?.live
    ? 'live TV'
    : scope?.genre ??
      (category === 'kdrama'
        ? 'K-Drama'
        : category === 'series'
        ? 'TV shows'
        : category === 'movie'
        ? 'movies'
        : category === 'anime'
        ? 'anime'
        : undefined);

  const recommended = useMemo(() => {
    const all = rows.flatMap((r) => r.items);
    return all
      .filter(
        (t) =>
          matchSearchCategory(t, category) &&
          (!scope?.genre || t.genres.some((g) => g.toLowerCase() === scope.genre!.toLowerCase())),
      )
      .slice(0, 30);
  }, [rows, category, scope?.genre]);

  const results = useMemo(() => {
    return rawResults.filter(
      (t) =>
        matchSearchCategory(t, category) &&
        (!scope?.genre || t.genres.some((g) => g.toLowerCase() === scope.genre!.toLowerCase())),
    );
  }, [rawResults, category, scope?.genre]);

  useEffect(() => {
    getHistory().then(setHistory);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  // Next-word / full-title suggestions while typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || scope?.live) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      suggest(q, history).then((s) => !cancelled && setSuggestions(s));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, history, scope?.live]);

  // Search runs on the title part only, with instant cache lookup and AbortController cancellation
  useEffect(() => {
    const q = parsed.text;
    if (q.length < 2 || scope?.live) {
      setRawResults([]);
      setSearching(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // 1. Show cached results instantly if available
    getCachedSearch(q).then((cachedResults) => {
      if (ctrl.signal.aborted) return;
      if (cachedResults.length > 0) {
        setRawResults(cachedResults);
      }
    });

    // 2. Perform live network search with 220ms debounce
    setSearching(true);
    const timer = setTimeout(() => {
      searchAll(q, false, ctrl.signal)
        .then((found) => {
          if (ctrl.signal.aborted) return;
          setRawResults(found);
          if (found[0] && !found[0].nsfw) warmUp(found[0]);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!ctrl.signal.aborted) setSearching(false);
        });
    }, 220);

    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [parsed.text, scope?.live]);

  const channels = useMemo(() => (scope?.live ? searchChannels(deferred, 24) : []), [deferred, scope?.live]);
  const hasQuery = deferred.trim().length > 0;
  const cell = Math.floor((width - 24 - 16) / 3);

  // "Season 1 episode 10" typed after a series name: offer the exact episode and season.
  const series = useMemo(() => (parsed.season || parsed.episode ? results.find((t) => t.kind === 'series') : undefined), [parsed, results]);

  const remember = useCallback(async (text: string) => {
    setHistory(await addHistory(text));
  }, []);

  const open = useCallback(
    (t: Title, season?: number) => {
      Keyboard.dismiss();
      remember(query || t.name);
      navigation.navigate('Title', { id: t.id, season });
    },
    [navigation, query, remember],
  );

  const playEpisode = useCallback(
    async (t: Title, season: number, episode: number) => {
      Keyboard.dismiss();
      remember(query);
      const full = await loadDetail(t.id);
      const hit = full.seasons.find((s) => s.number === season)?.episodes.find((e) => e.number === episode);
      if (hit) navigation.navigate('Player', { id: t.id, episodeId: hit.id });
      else navigation.navigate('Title', { id: t.id, season });
    },
    [navigation, query, remember],
  );

  const renderRecommended = useCallback<ListRenderItem<Title>>(
    ({ item }) => (
      <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.recRow, pressed ? { backgroundColor: colors.surface2 } : null]}>
        <View style={styles.recThumb}>
          <Image source={item.background || item.poster} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} />
        </View>
        <Txt weight="medium" size={14} numberOfLines={2} style={styles.recTitle}>
          {item.name}
        </Txt>
        <Pressable hitSlop={10} onPress={() => navigation.navigate('Player', { id: item.id })}>
          <Ionicons name="play-circle-outline" size={34} color={colors.text} />
        </Pressable>
      </Pressable>
    ),
    [open, navigation],
  );

  /** Vertically stacked list result card: thumbnail on left, untruncated title & metadata on right */
  const renderResult = useCallback<ListRenderItem<Title>>(
    ({ item }) => {
      const posterUri = item.poster || item.background;
      const isAn = isAnime(item);
      const isKd = isKDrama(item);
      const badgeLabel = isAn ? 'ANIME' : isKd ? 'K-DRAMA' : item.kind === 'series' ? 'SERIES' : 'MOVIE';
      const badgeBg = isAn ? '#8A2BE2' : isKd ? '#007ACC' : colors.red;
      return (
        <Pressable
          onPress={() => open(item, parsed.season)}
          style={({ pressed }) => [styles.resultCard, pressed && styles.resultCardPressed]}
        >
          <View style={[styles.resultThumb, { backgroundColor: item.tint }]}>
            {posterUri ? (
              <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} />
            ) : null}
            {!posterUri ? (
              <View style={styles.fallbackThumb}>
                <Txt weight="bold" size={11} align="center" numberOfLines={2}>
                  {item.name}
                </Txt>
              </View>
            ) : null}
          </View>
          <View style={styles.resultInfo}>
            {/* Complete, untruncated content title directly beside the thumbnail */}
            <Txt weight="bold" size={15} color={colors.text} style={styles.resultTitle}>
              {item.name}
            </Txt>
            <View style={styles.metaRow}>
              <View style={[styles.catBadge, { backgroundColor: badgeBg }]}>
                <Txt weight="bold" size={9} color={colors.text}>
                  {badgeLabel}
                </Txt>
              </View>
              {item.format ? (
                <View style={[styles.catBadge, { backgroundColor: colors.surface3, marginLeft: 6 }]}>
                  <Txt weight="medium" size={9} color={colors.textDim}>
                    {item.format}
                  </Txt>
                </View>
              ) : null}
              {item.status ? (
                <View style={[styles.catBadge, { backgroundColor: colors.surface3, marginLeft: 6 }]}>
                  <Txt weight="medium" size={9} color={colors.textDim}>
                    {item.status === 'RELEASING' ? 'AIRING' : item.status === 'FINISHED' ? 'COMPLETED' : item.status}
                  </Txt>
                </View>
              ) : null}
              {item.year ? (
                <Txt size={12} color={colors.textDim} style={{ marginLeft: 6 }}>
                  {item.year}
                </Txt>
              ) : null}
              {item.imdbRating ? (
                <Txt weight="bold" size={12} color="#FFD700" style={{ marginLeft: 8 }}>
                  ★ {item.imdbRating}
                </Txt>
              ) : null}
              {item.language ? (
                <Txt size={12} color={colors.textDim} style={{ marginLeft: 8 }}>
                  {item.language}
                </Txt>
              ) : null}
            </View>
            {item.aliases && item.aliases.length > 0 ? (
              <Txt size={11} color={colors.textDim} numberOfLines={1} style={{ marginTop: 2 }}>
                {item.aliases[0]}
              </Txt>
            ) : null}
            {item.genres && item.genres.length > 0 ? (
              <Txt size={12} color={colors.textMuted} numberOfLines={1} style={{ marginTop: 3 }}>
                {item.genres.slice(0, 3).join(' • ')}
              </Txt>
            ) : null}
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => navigation.navigate('Player', { id: item.id })}
            style={styles.playBtn}
          >
            <Ionicons name="play-circle-outline" size={32} color={colors.red} />
          </Pressable>
        </Pressable>
      );
    },
    [open, parsed.season, navigation],
  );

  const showSuggestions = focused && suggestions.length > 0 && query.trim().length >= 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        {scopeLabel ? (
          <View style={styles.scope}>
            <Txt weight="semibold" size={12}>In {scopeLabel}</Txt>
          </View>
        ) : null}
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textDim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          placeholder={scopeLabel ? `Search ${scopeLabel}…` : 'Try "Bachelor Point season 1 ep 10"'}
          placeholderTextColor={colors.textDim}
          selectionColor={colors.text}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => {
            Keyboard.dismiss();
            remember(query);
          }}
        />
        {searching ? <ActivityIndicator size="small" color={colors.textDim} style={{ marginRight: 8 }} /> : null}
        {query.length > 0 ? (
          <Pressable hitSlop={8} onPress={() => setQuery('')}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {!scope?.live ? (
        <View style={styles.categoryBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryBar}>
            {CATEGORY_TABS.map((tab) => {
              const active = category === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setCategory(tab.key)}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                >
                  <Txt weight={active ? 'bold' : 'medium'} size={13} color={active ? '#000000' : colors.textDim}>
                    {tab.label}
                  </Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {showSuggestions ? (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable
              key={`${s.kind}:${s.text}`}
              onPress={() => {
                const { season, episode } = parseQuery(query);
                const suffix = season ? ` season ${season}${episode ? ` ep ${episode}` : ''}` : '';
                setQuery(`${s.text}${suffix}`);
                Keyboard.dismiss();
                remember(s.text);
              }}
              style={({ pressed }) => [styles.suggestRow, pressed ? { backgroundColor: colors.surface2 } : null]}
            >
              <Ionicons name={s.kind === 'history' ? 'time-outline' : 'search-outline'} size={18} color={colors.textDim} />
              <Txt size={14} numberOfLines={1} style={{ flex: 1, marginLeft: 12 }}>{s.text}</Txt>
              <Pressable hitSlop={8} onPress={() => setQuery(s.text + ' ')}>
                <Ionicons name="arrow-up-outline" size={18} color={colors.textDim} style={{ transform: [{ rotate: '-45deg' }] }} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!hasQuery ? (
        <FlatList
          key="recommended"
          data={recommended}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={10}
          windowSize={7}
          ListHeaderComponent={
            <View>
              {history.length > 0 && !scope?.live ? (
                <View>
                  <View style={styles.historyHead}>
                    <Txt weight="bold" size={18}>Recent searches</Txt>
                    <Pressable
                      hitSlop={8}
                      onPress={async () => {
                        await clearHistory();
                        setHistory([]);
                      }}
                    >
                      <Txt weight="semibold" size={13} color={colors.textMuted}>Clear</Txt>
                    </Pressable>
                  </View>
                  {history.slice(0, 8).map((h) => (
                    <Pressable key={h} onPress={() => setQuery(h)} style={({ pressed }) => [styles.suggestRow, pressed ? { backgroundColor: colors.surface2 } : null]}>
                      <Ionicons name="time-outline" size={18} color={colors.textDim} />
                      <Txt size={14} numberOfLines={1} style={{ flex: 1, marginLeft: 12 }}>{h}</Txt>
                      <Pressable hitSlop={10} onPress={async () => setHistory(await removeHistory(h))}>
                        <Ionicons name="close" size={18} color={colors.textDim} />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {!scope?.live ? (
                <Txt weight="bold" size={18} style={styles.section}>
                  {scopeLabel ? `Popular in ${scopeLabel}` : 'Recommended TV Shows & Movies'}
                </Txt>
              ) : (
                <Txt size={14} color={colors.textMuted} style={styles.section}>Type a channel name, country or category.</Txt>
              )}
            </View>
          }
          renderItem={renderRecommended}
        />
      ) : results.length === 0 && channels.length === 0 && searching ? (
        <View key="busy" style={styles.empty}>
          <ActivityIndicator color={colors.text} />
          <Txt size={14} color={colors.textMuted} align="center" style={{ marginTop: 14 }}>Searching all sources…</Txt>
        </View>
      ) : results.length === 0 && channels.length === 0 ? (
        <View key="empty" style={styles.empty}>
          <Txt weight="bold" size={20} align="center">Nothing matched “{parsed.text || deferred}”.</Txt>
          <Txt size={14} color={colors.textMuted} align="center" style={{ marginTop: 10 }}>
            {scopeLabel ? `Nothing in ${scopeLabel} matches yet. Try a shorter name or search everywhere from Home.` : 'Try a shorter name or another spelling.'}
          </Txt>
        </View>
      ) : (
        <FlatList
          key="results-list"
          data={results}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContainer}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <View>
              {series && (parsed.season || parsed.episode) ? (
                <View style={styles.jump}>
                  <Txt weight="bold" size={15} numberOfLines={1}>{series.name}</Txt>
                  <View style={styles.jumpRow}>
                    {parsed.episode ? (
                      <Pressable style={[styles.jumpBtn, { backgroundColor: colors.text }]} onPress={() => playEpisode(series, parsed.season ?? 1, parsed.episode!)}>
                        <Ionicons name="play" size={16} color="#000000" />
                        <Txt weight="bold" size={13} color="#000000" style={{ marginLeft: 6 }}>
                          Play S{parsed.season ?? 1} · E{parsed.episode}
                        </Txt>
                      </Pressable>
                    ) : null}
                    <Pressable style={[styles.jumpBtn, { backgroundColor: colors.surface5 }]} onPress={() => open(series, parsed.season ?? 1)}>
                      <Ionicons name="list" size={16} color={colors.text} />
                      <Txt weight="bold" size={13} style={{ marginLeft: 6 }}>
                        {parsed.season ? `Season ${parsed.season} episodes` : 'All episodes'}
                      </Txt>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {channels.length > 0 ? (
                <>
                  <Txt weight="bold" size={18} style={styles.section}>Live TV</Txt>
                  <FlatList
                    horizontal
                    data={channels}
                    keyExtractor={(c) => c.id}
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.channelRow}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => {
                          Keyboard.dismiss();
                          remember(query);
                          navigation.navigate('Live', { channelId: item.id });
                        }}
                        style={{ width: cell }}
                      >
                        <ChannelLogo channel={item} size={cell} />
                        <Txt weight="medium" size={12} numberOfLines={1} style={{ marginTop: 6 }}>
                          {item.name}
                        </Txt>
                      </Pressable>
                    )}
                  />
                </>
              ) : null}
              {results.length > 0 ? (
                <Txt weight="bold" size={18} style={styles.section}>
                  {category === 'all' ? 'All Results' : category === 'kdrama' ? 'Korean Dramas' : category === 'anime' ? 'Anime' : category === 'movie' ? 'Movies' : 'TV Series'}
                </Txt>
              ) : null}
            </View>
          }
          renderItem={renderResult}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12 },
  scope: { backgroundColor: colors.surface5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  categoryBarWrap: { marginTop: 10, marginBottom: 4 },
  categoryBar: { paddingHorizontal: 12, gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface3,
  },
  categoryChipActive: {
    backgroundColor: colors.text,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface5,
  },
  input: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15, marginHorizontal: 10, paddingVertical: 0 },
  suggestions: { marginHorizontal: 12, marginTop: 4, backgroundColor: colors.surface1, borderRadius: radius.sm, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginTop: 18, marginBottom: 4 },
  section: { paddingHorizontal: 12, marginTop: 20, marginBottom: 10 },
  recRow: { height: 76, marginBottom: 8, flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  recThumb: { width: 140, height: 76, backgroundColor: colors.surface2, borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm, overflow: 'hidden' },
  recTitle: { flex: 1, marginHorizontal: 12 },
  empty: { paddingHorizontal: 32, paddingTop: 80 },
  listContainer: { paddingHorizontal: 12, paddingBottom: 40, gap: 10 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.surface4,
  },
  resultCardPressed: { backgroundColor: colors.surface2 },
  resultThumb: {
    width: 68,
    height: 98,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface3,
  },
  fallbackThumb: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  resultInfo: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  resultTitle: { fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  catBadge: {
    backgroundColor: colors.red,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  playBtn: { padding: 6, marginLeft: 8 },
  channelRow: { gap: 8, paddingHorizontal: 12 },
  jump: { marginHorizontal: 12, marginTop: 14, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2 },
  jumpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  jumpBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 38, borderRadius: radius.sm },
});
