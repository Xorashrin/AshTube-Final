import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from '../components/Img';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Buttons';
import { Wordmark } from '../components/Logo';
import { Txt } from '../components/Txt';
import { rowsByKey, useRows } from '../services/catalog';
import type { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Landing'>;

interface Slide {
  key: string;
  title: string;
  body: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

// Copy mirrors the structure of the M03.1 landing carousel, rewritten for MythTube.
const SLIDES: Slide[] = [
  { key: 'collage', title: 'Unlimited movies, TV shows & more', body: 'Fresh uploads, every day.' },
  { key: 'download', title: 'Download and watch offline', body: 'Always have something to watch offline.', icon: 'download-outline' },
  { key: 'devices', title: 'Smooth playback', body: 'Seek, resume and switch servers instantly.', icon: 'checkmark-circle-outline' },
  { key: 'everywhere', title: 'Watch everywhere', body: 'Stream on your phone, tablet, laptop, TV and more.', icon: 'tv-outline' },
];

const COLLAGE_ROWS = rowsByKey('cm-movies');

function Collage() {
  const { width } = useWindowDimensions();
  const { rows } = useRows(COLLAGE_ROWS);
  const posters = (rows[0]?.items ?? []).filter((t) => t.poster).slice(0, 18);
  const tile = width / 3.2;
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <View style={[styles.collage, { transform: [{ rotate: '-12deg' }, { scale: 1.35 }] }]}>
        {posters.map((t) => (
          <Image
            key={t.id}
            source={{ uri: t.poster! }}
            style={{ width: tile, height: tile * 1.5, margin: 3, borderRadius: 4 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ))}
      </View>
      <LinearGradient colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.55)', '#000000']} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export default function LandingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showToast } = useApp();
  const [page, setPage] = useState(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width)),
    [width],
  );

  return (
    <View style={styles.root}>
      {page === 0 ? <Collage /> : null}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Wordmark size={30} />
        <View style={styles.topLinks}>
          <Pressable hitSlop={8} onPress={() => showToast('MythTube does not collect personal data beyond your sign-in')}>
            <Txt weight="bold" size={13}>PRIVACY</Txt>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => showToast('Sign in or create an account to start watching')}>
            <Txt weight="bold" size={13}>HELP</Txt>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => navigation.navigate('SignIn')}>
            <Txt weight="bold" size={13}>SIGN IN</Txt>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={SLIDES}
        horizontal
        pagingEnabled
        style={styles.pager}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            {item.icon ? (
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon} size={72} color={colors.text} />
              </View>
            ) : null}
            <Txt weight="black" size={item.icon ? 26 : 32} align="center" lineHeight={item.icon ? 32 : 38}>
              {item.title}
            </Txt>
            <Txt size={16} align="center" color={colors.text90} style={{ marginTop: 14 }}>
              {item.body}
            </Txt>
          </View>
        )}
      />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === page ? styles.dotActive : null]} />
          ))}
        </View>
        <Button label="GET STARTED" variant="red" height={48} onPress={() => navigation.navigate('SignUp')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  collage: { flexDirection: 'row', flexWrap: 'wrap', marginTop: -60, marginLeft: -40 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 2 },
  topLinks: { flexDirection: 'row', gap: 18 },
  pager: { flex: 1 },
  slide: { justifyContent: 'flex-end', paddingHorizontal: 32, paddingBottom: 40 },
  iconCircle: { alignSelf: 'center', marginBottom: 40 },
  bottom: { paddingHorizontal: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textDim },
  dotActive: { backgroundColor: colors.red },
});
