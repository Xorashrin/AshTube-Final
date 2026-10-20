import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameTile } from '../components/Rows';
import { Poster } from '../components/Poster';
import { Txt } from '../components/Txt';
import { img } from '../data/images';
import { AVAILABLE, GAMES, type Title } from '../data/mock';
import type { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, font, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

function matches(t: Title, q: string): boolean {
  const s = q.toLowerCase();
  return (
    t.name.toLowerCase().includes(s) ||
    t.genres.some((g) => g.toLowerCase().includes(s)) ||
    t.cast.some((c) => c.toLowerCase().includes(s)) ||
    t.moods.some((m) => m.toLowerCase().includes(s))
  );
}

export default function SearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { showToast } = useApp();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const results = useMemo(() => (q ? AVAILABLE.filter((t) => matches(t, q)) : []), [q]);
  const games = useMemo(() => (q ? GAMES.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()) || g.genre.toLowerCase().includes(q.toLowerCase())) : []), [q]);
  const cell = (width - 24 - 16) / 3;
  const open = (t: Title) => navigation.navigate('Title', { id: t.id });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textDim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Search shows, movies, games…"
          placeholderTextColor={colors.textDim}
          selectionColor={colors.text}
          style={styles.input}
          returnKeyType="search"
        />
        {query ? (
          <Pressable hitSlop={8} onPress={() => setQuery('')}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Pressable hitSlop={8} onPress={() => showToast('Voice search is not part of this demo')}>
            <Ionicons name="mic" size={20} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {!q ? (
        <FlatList
          data={AVAILABLE}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Txt weight="bold" size={18} style={styles.section}>
              Recommended TV Shows & Movies
            </Txt>
          }
          initialNumToRender={10}
          windowSize={7}
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.recRow, pressed ? { backgroundColor: colors.surface2 } : null]}>
              <View style={styles.recThumb}>
                <Image source={img.backdrop(item.seed)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} />
              </View>
              <Txt weight="medium" size={14} numberOfLines={2} style={{ flex: 1, marginHorizontal: 12 }}>
                {item.name}
              </Txt>
              <Pressable hitSlop={10} onPress={() => navigation.navigate('Player', { id: item.id })}>
                <Ionicons name="play-circle-outline" size={34} color={colors.text} />
              </Pressable>
            </Pressable>
          )}
        />
      ) : results.length === 0 && games.length === 0 ? (
        <View style={styles.empty}>
          <Txt weight="bold" size={20} align="center">
            Oh darn. We don't have that.
          </Txt>
          <Txt size={14} color={colors.textMuted} align="center" style={{ marginTop: 10 }}>
            Try searching for another movie, show, actor, director, or genre.
          </Txt>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(t) => t.id}
          numColumns={3}
          keyboardShouldPersistTaps="handled"
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 12 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 30 }}
          ListHeaderComponent={
            <View>
              {games.length > 0 ? (
                <>
                  <Txt weight="bold" size={18} style={styles.section}>
                    Mobile Games
                  </Txt>
                  <View style={styles.gameRow}>
                    {games.slice(0, 3).map((g) => (
                      <GameTile key={g.id} game={g} size={cell} onPress={() => showToast(`${g.name} is a preview — games arrive in a later phase`)} />
                    ))}
                  </View>
                </>
              ) : null}
              {results.length > 0 ? (
                <Txt weight="bold" size={18} style={styles.section}>
                  Movies & TV
                </Txt>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <Poster title={item} width={cell} height={cell * 1.45} onPress={open} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { height: 48, justifyContent: 'center', paddingHorizontal: 12 },
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
  section: { paddingHorizontal: 12, marginTop: 20, marginBottom: 10 },
  recRow: { height: 76, marginBottom: 8, flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  recThumb: { width: 140, height: 76, backgroundColor: colors.surface2, borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm, overflow: 'hidden' },
  empty: { paddingHorizontal: 32, paddingTop: 80 },
  gameRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
});
