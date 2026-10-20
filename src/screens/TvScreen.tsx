import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Billboard } from '../components/Billboard';
import { TALL_POSTER } from '../components/Poster';
import { PosterRow, Top10Row } from '../components/Rows';
import { ScreenHeader } from '../components/ScreenHeader';
import { SERIES, TOP10_TV, getTitle, type Title } from '../data/mock';
import { useRootNav } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors } from '../theme/tokens';

const GENRE_ROWS = ['Drama', 'Crime', 'Fantasy', 'Sci-Fi', 'Thriller', 'Comedy', 'Mystery', 'Sports', 'Kids'];

export default function TvScreen() {
  const nav = useRootNav();
  const { profileData, toggleMyList, showToast } = useApp();
  const hero = getTitle('echoes-of-rahu');
  const inMyList = profileData.myList.includes(hero.id);
  const open = useCallback((t: Title) => nav.navigate('Title', { id: t.id }), [nav]);

  const rows = useMemo(
    () =>
      GENRE_ROWS.map((g) => ({ genre: g, items: SERIES.filter((t) => t.genres.includes(g)) })).filter((r) => r.items.length >= 2),
    [],
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="TV Shows" actions={['downloads', 'search']} />
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Billboard
          title={hero}
          inMyList={inMyList}
          onOpen={() => open(hero)}
          onPlay={() => nav.navigate('Player', { id: hero.id })}
          onToggleList={() => {
            toggleMyList(hero.id);
            showToast(inMyList ? 'Removed from My List' : 'Added to My List');
          }}
        />
        <Top10Row title="Top 10 TV Shows in Bangladesh Today" items={TOP10_TV} onPressTitle={open} />
        <PosterRow title="MythTube Original Series" items={SERIES.filter((t) => t.original)} onPressTitle={open} width={TALL_POSTER.width} height={TALL_POSTER.height} />
        <PosterRow title="New Episodes" items={SERIES.filter((t) => t.badge)} onPressTitle={open} />
        {rows.map((r) => (
          <PosterRow key={r.genre} title={`${r.genre} TV Shows`} items={r.items} onPressTitle={open} />
        ))}
        <PosterRow title="All TV Shows" items={SERIES} onPressTitle={open} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
