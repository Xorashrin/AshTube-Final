import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button } from '../components/Buttons';
import { GameRow } from '../components/Rows';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import { img } from '../data/images';
import { GAMES, type Game } from '../data/mock';
import { useApp } from '../state/AppState';
import { colors, radius } from '../theme/tokens';

export default function GamesScreen() {
  const { width } = useWindowDimensions();
  const { showToast } = useApp();
  const featured = GAMES[0];
  const preview = useCallback((g: Game) => showToast(`${g.name} is a preview — games arrive in a later phase`), [showToast]);
  const cardWidth = width - 24;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Games" actions={['cast', 'downloads', 'search']} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => preview(featured)} style={[styles.featured, { width: cardWidth, height: (cardWidth * 9) / 16 + 92 }]}>
          <Image source={img.backdrop(featured.seed)} style={[styles.featuredArt, { height: (cardWidth * 9) / 16 }]} contentFit="cover" cachePolicy="memory-disk" />
          <LinearGradient colors={['transparent', featured.tint]} style={[styles.featuredArt, { height: (cardWidth * 9) / 16 }]} />
          <View style={[styles.featuredInfo, { backgroundColor: featured.tint }]}>
            <View style={styles.featuredIcon}>
              <Image source={img.square(featured.seed)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Txt weight="bold" size={16}>
                {featured.name}
              </Txt>
              <Txt size={12} color={colors.text80}>
                {featured.genre} • Mobile Game
              </Txt>
            </View>
            <Button label="Get Game" variant="white" height={34} onPress={() => preview(featured)} />
          </View>
        </Pressable>
        <GameRow title="Mobile Games to Play Now" items={GAMES} onPressGame={preview} />
        <GameRow title="Puzzle & Word Games" items={GAMES.filter((g) => g.genre === 'Puzzle' || g.genre === 'Word')} onPressGame={preview} />
        <GameRow title="Action & Arcade" items={GAMES.filter((g) => ['Action', 'Arcade', 'Racing'].includes(g.genre))} onPressGame={preview} />
        <GameRow title="Strategy & RPG" items={GAMES.filter((g) => g.genre === 'Strategy' || g.genre === 'RPG')} onPressGame={preview} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  featured: { alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden', marginTop: 8, backgroundColor: colors.surface2 },
  featuredArt: { position: 'absolute', top: 0, left: 0, right: 0 },
  featuredInfo: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 92, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  featuredIcon: { width: 56, height: 56, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface4 },
});
