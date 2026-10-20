import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { IconAction } from '../components/Buttons';
import { ChannelRow } from '../components/ChannelRow';
import { Chip } from '../components/Chip';
import { MLogo } from '../components/Logo';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import { VodRow } from '../components/VodRow';
import { img } from '../data/images';
import { type Title } from '../data/mock';
import { RESOLVED_TITLES } from '../data/resolveTitle';
import { moviesChannels, seriesChannels, sportsChannels, type Channel } from '../data/channels';
import { vodByCategory, type VodTitle } from '../data/vod';
import { useRootNav } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, font, layout, radius } from '../theme/tokens';

type SectionKey = 'coming' | 'everyone' | 'tv' | 'movies' | 'live';

const SECTIONS: { key: SectionKey; emoji: string; label: string }[] = [
  { key: 'coming', emoji: '🍿', label: 'Coming Soon' },
  { key: 'everyone', emoji: '🔥', label: "Everyone's Watching" },
  { key: 'tv', emoji: '🔟', label: 'Top 10 TV Shows' },
  { key: 'movies', emoji: '🔟', label: 'Top 10 Movies' },
  { key: 'live', emoji: '📡', label: 'Live Right Now' },
];

const REAL_SERIES = RESOLVED_TITLES.filter((t) => t.kind === 'series');
const REAL_MOVIES = RESOLVED_TITLES.filter((t) => t.kind === 'movie');

const COMING_REAL: Title[] = RESOLVED_TITLES.slice(10, 16).map((t, idx) => ({
  ...t,
  comingSoon: {
    month: 'NOV',
    day: String(10 + idx),
    label: `Arrives November ${10 + idx}`,
  },
}));

const EVERYONE = RESOLVED_TITLES.slice(0, 8);
const TOP10_TV = REAL_SERIES.slice(0, 10);
const TOP10_MOVIES = REAL_MOVIES.slice(0, 10);

function Card({ title, rank, mode }: { title: Title; rank?: number; mode: 'coming' | 'play' }) {
  const nav = useRootNav();
  const { width } = useWindowDimensions();
  const { profileData, toggleMyList, toggleReminder, showToast } = useApp();
  const lead = mode === 'coming' || rank ? 56 : 12;
  const mediaWidth = width - lead - 12;
  const reminded = profileData.reminders.includes(title.id);
  const inList = profileData.myList.includes(title.id);
  const mediaUri = title.background || title.poster || img.backdrop(title.seed);

  return (
    <View style={styles.card}>
      <View style={{ width: lead, alignItems: 'center' }}>
        {mode === 'coming' && title.comingSoon ? (
          <>
            <Txt weight="medium" size={12} color={colors.textMuted}>
              {title.comingSoon.month}
            </Txt>
            <Txt weight="black" size={30} lineHeight={34}>
              {title.comingSoon.day}
            </Txt>
          </>
        ) : rank ? (
          <Svg width={50} height={70}>
            <SvgText x={25} y={62} fontSize={66} fontFamily={font.display} textAnchor="middle" fill={colors.bg} stroke="#8C8C8C" strokeWidth={2.5}>
              {String(rank)}
            </SvgText>
          </Svg>
        ) : null}
      </View>
      <View style={{ width: mediaWidth }}>
        <Pressable onPress={() => nav.navigate('Title', { id: title.id })} style={[styles.media, { height: (mediaWidth * 9) / 16 }]}>
          <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={title.id} />
          {title.original ? (
            <View style={styles.mediaLogo}>
              <MLogo size={18} />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.titleRow}>
          <Txt weight="display" size={30} lineHeight={30} numberOfLines={2} style={{ flex: 1 }} spacing={0.5}>
            {title.name.toUpperCase()}
          </Txt>
          {mode === 'coming' ? (
            <>
              <IconAction
                label={reminded ? 'Reminder Set' : 'Remind Me'}
                icon={reminded ? 'bell-check' : 'bell-outline'}
                width={74}
                active={reminded}
                onPress={() => {
                  toggleReminder(title.id);
                  showToast(reminded ? 'Reminder removed' : 'All set! We’ll remind you right before it starts.');
                }}
              />
              <IconAction label="Info" icon="information-outline" width={48} onPress={() => nav.navigate('Title', { id: title.id })} />
            </>
          ) : (
            <>
              <IconAction label="Share" icon="send-outline" width={52} onPress={() => Share.share({ message: `Check out "${title.name}" on MythTube` }).catch(() => undefined)} />
              <IconAction
                label="My List"
                icon={inList ? 'check' : 'plus'}
                width={56}
                onPress={() => {
                  toggleMyList(title.id);
                  showToast(inList ? 'Removed from My List' : 'Added to My List');
                }}
              />
              <IconAction label="Play" icon="play" width={44} onPress={() => nav.navigate('Player', { id: title.id })} />
            </>
          )}
        </View>
        {title.comingSoon ? (
          <Txt weight="medium" size={13} style={{ marginTop: 10 }}>
            {title.comingSoon.label}
          </Txt>
        ) : null}
        <Txt size={13} color={colors.textMuted} lineHeight={19} numberOfLines={3} style={{ marginTop: 6 }}>
          {title.synopsis}
        </Txt>
        <Txt size={12} color={colors.text90} style={{ marginTop: 8 }}>
          {(title.moods || []).join('  •  ')}
        </Txt>
      </View>
    </View>
  );
}

export default function NewHotScreen() {
  const nav = useRootNav();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Record<SectionKey, number>>({ coming: 0, everyone: 0, tv: 0, movies: 0, live: 0 });
  const [active, setActive] = useState<SectionKey>('coming');
  const jumping = useRef(false);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (jumping.current) return;
    const y = e.nativeEvent.contentOffset.y + layout.chipRowHeight + 20;
    let current: SectionKey = 'coming';
    for (const s of SECTIONS) if (y >= offsets.current[s.key]) current = s.key;
    if (current !== active) setActive(current);
  };

  const jump = (key: SectionKey) => {
    setActive(key);
    jumping.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, offsets.current[key] - layout.chipRowHeight), animated: true });
    setTimeout(() => (jumping.current = false), 600);
  };

  const sectionList: Record<SectionKey, { items: Title[]; mode: 'coming' | 'play'; ranked: boolean }> = {
    coming: { items: COMING_REAL, mode: 'coming', ranked: false },
    everyone: { items: EVERYONE, mode: 'play', ranked: false },
    tv: { items: TOP10_TV, mode: 'play', ranked: true },
    movies: { items: TOP10_MOVIES, mode: 'play', ranked: true },
    live: { items: [], mode: 'play', ranked: false },
  };

  // Real backend — IPTV channels parsed from the scraped + validated channels.json.
  const liveMovies = moviesChannels(12);
  const liveSeries = seriesChannels(12);
  const liveSports = sportsChannels(12);
  const openChannel = (c: Channel) => nav.navigate('Live', { channelId: c.id, filter: 'All' });
  // Real VOD backend — every title is real, scraped from Cinemeta.
  const vodMovies = vodByCategory('Movies', 18);
  const vodSeries = vodByCategory('Series', 18);
  const vodAnime = vodByCategory('Anime', 18);
  const vodCartoon = vodByCategory('Cartoon', 18);
  const vodKids = vodByCategory('Kids', 18);
  const openVod = (t: VodTitle) => nav.navigate('Title', { id: t.id });

  return (
    <View style={styles.root}>
      <ScreenHeader title="New & Hot" actions={['downloads', 'search']} />
      <ScrollView ref={scrollRef} stickyHeaderIndices={[0]} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false}>
        <View style={styles.chipBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {SECTIONS.map((s) => (
              <Chip key={s.key} emoji={s.emoji} label={s.label} selected={active === s.key} solid onPress={() => jump(s.key)} />
            ))}
          </ScrollView>
        </View>
        {SECTIONS.map((s) => (
          <View key={s.key} onLayout={(e) => (offsets.current[s.key] = e.nativeEvent.layout.y)}>
            <View style={styles.sectionHeader}>
              <Txt size={18}>{s.emoji}</Txt>
              <Txt weight="bold" size={18} style={{ marginLeft: 8 }}>
                {s.label}
              </Txt>
            </View>
            {s.key === 'live' ? (
              <View>
                <VodRow title="🔥 Hot Movies" items={vodMovies} onPressTitle={openVod} />
                <VodRow title="📺 Binge-Worthy Series" items={vodSeries} onPressTitle={openVod} />
                <VodRow title="🎨 Trending Cartoons" items={vodCartoon} onPressTitle={openVod} />
                <VodRow title="✨ New Anime" items={vodAnime} onPressTitle={openVod} />
                <VodRow title="👨‍👩‍👧 Family Picks" items={vodKids} onPressTitle={openVod} />
                <ChannelRow title="Live Movies" items={liveMovies} onPressChannel={openChannel} />
                <ChannelRow title="Live Series" items={liveSeries} onPressChannel={openChannel} />
                <ChannelRow title="Live Sports" items={liveSports} onPressChannel={openChannel} />
              </View>
            ) : (
              sectionList[s.key].items.map((t, i) => (
                <Card key={`${s.key}-${t.id}`} title={t} mode={sectionList[s.key].mode} rank={sectionList[s.key].ranked ? i + 1 : undefined} />
              ))
            )}
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  chipBar: { backgroundColor: colors.bg, height: layout.chipRowHeight, justifyContent: 'center' },
  chips: { gap: 8, paddingHorizontal: layout.gutter },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter, paddingTop: 18, paddingBottom: 12 },
  card: { flexDirection: 'row', marginBottom: 34 },
  media: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface2 },
  mediaLogo: { position: 'absolute', top: 8, left: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
});
