import { Image } from 'expo-image';
import React, { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { IconAction } from '../components/Buttons';
import { ChannelRow } from '../components/ChannelRow';
import { Chip } from '../components/Chip';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import { moviesChannels, seriesChannels, sportsChannels, type Channel } from '../data/channels';
import type { Title } from '../data/types';
import { NEWHOT_ROWS, useRows } from '../services/catalog';
import { useRootNav } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, layout, radius } from '../theme/tokens';

type SectionKey = 'coming' | 'airing' | 'new' | 'movies' | 'series' | 'live';

const SECTIONS: { key: SectionKey; emoji: string; label: string; row?: string }[] = [
  { key: 'coming', emoji: '🍿', label: 'Coming Soon', row: 'sf-upcoming' },
  { key: 'airing', emoji: '📡', label: 'Airing This Week', row: 'al-airing' },
  { key: 'new', emoji: '🔥', label: 'New This Week', row: 'sf-new' },
  { key: 'movies', emoji: '🎬', label: 'Popular Movies', row: 'cm-movies' },
  { key: 'series', emoji: '📺', label: 'Popular Series', row: 'cm-series' },
  { key: 'live', emoji: '🔴', label: 'Live Right Now' },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function whenLabel(t: Title): { month: string; day: string; label: string } | null {
  const at = t.airing?.at;
  if (!at) return null;
  const d = new Date(at);
  const hours = Math.max(0, Math.round((at - Date.now()) / 3600000));
  const label = hours < 24 ? `Episode ${t.airing!.episode} in ${hours}h` : `Episode ${t.airing!.episode} in ${Math.round(hours / 24)}d`;
  return { month: MONTHS[d.getMonth()], day: String(d.getDate()).padStart(2, '0'), label };
}

function Card({ title, mode }: { title: Title; mode: 'coming' | 'play' }) {
  const nav = useRootNav();
  const { width } = useWindowDimensions();
  const { profileData, toggleMyList, toggleReminder, showToast } = useApp();
  const when = whenLabel(title);
  const lead = mode === 'coming' ? 56 : 12;
  const mediaWidth = width - lead - 12;
  const reminded = profileData.reminders.includes(title.id);
  const inList = profileData.myList.includes(title.id);
  const uri = title.background || title.poster;

  return (
    <View style={styles.card}>
      <View style={{ width: lead, alignItems: 'center' }}>
        {mode === 'coming' ? (
          <>
            <Txt weight="medium" size={12} color={colors.textMuted}>{when?.month ?? MONTHS[new Date(title.addedAt ?? Date.now()).getMonth()]}</Txt>
            <Txt weight="black" size={30} lineHeight={34}>{when?.day ?? String(new Date(title.addedAt ?? Date.now()).getDate()).padStart(2, '0')}</Txt>
          </>
        ) : null}
      </View>
      <View style={{ width: mediaWidth }}>
        <Pressable onPress={() => nav.navigate('Title', { id: title.id })} style={[styles.media, { height: (mediaWidth * 9) / 16, backgroundColor: title.tint }]}>
          {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={title.id} /> : null}
        </Pressable>
        <View style={styles.titleRow}>
          <Txt weight="display" size={28} lineHeight={28} numberOfLines={2} style={{ flex: 1 }} spacing={0.5}>
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
                  showToast(reminded ? 'Reminder removed' : 'All set! It will be in My List reminders.');
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
        {when ? (
          <Txt weight="medium" size={13} style={{ marginTop: 10 }}>{when.label}</Txt>
        ) : null}
        {title.synopsis ? (
          <Txt size={13} color={colors.textMuted} lineHeight={19} numberOfLines={3} style={{ marginTop: 6 }}>
            {title.synopsis}
          </Txt>
        ) : null}
        <Txt size={12} color={colors.text90} style={{ marginTop: 8 }}>
          {[title.year, ...title.genres.slice(0, 3)].join('  •  ')}
        </Txt>
      </View>
    </View>
  );
}

export default function NewHotScreen() {
  const nav = useRootNav();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Record<SectionKey, number>>({ coming: 0, airing: 0, new: 0, movies: 0, series: 0, live: 0 });
  const [active, setActive] = useState<SectionKey>('coming');
  const jumping = useRef(false);
  const { rows, refresh, refreshing } = useRows(NEWHOT_ROWS);

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

  const itemsOf = (key?: string, limit = 12): Title[] => (rows.find((r) => r.def.key === key)?.items ?? []).slice(0, limit);
  const openChannel = (c: Channel) => nav.navigate('Live', { channelId: c.id, filter: 'All' });

  return (
    <View style={styles.root}>
      <ScreenHeader title="New & Hot" actions={['downloads', 'search']} />
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[0]}
        onScroll={onScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text} />}
      >
        <View style={styles.chipBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {SECTIONS.map((s) => (
              <Chip key={s.key} emoji={s.emoji} label={s.label} selected={active === s.key} solid onPress={() => jump(s.key)} />
            ))}
          </ScrollView>
        </View>
        {SECTIONS.map((s) => {
          const items = itemsOf(s.row);
          const loading = s.row ? rows.find((r) => r.def.key === s.row)?.loading : false;
          return (
            <View key={s.key} onLayout={(e) => (offsets.current[s.key] = e.nativeEvent.layout.y)}>
              <View style={styles.sectionHeader}>
                <Txt size={18}>{s.emoji}</Txt>
                <Txt weight="bold" size={18} style={{ marginLeft: 8 }}>{s.label}</Txt>
              </View>
              {s.key === 'live' ? (
                <View>
                  <ChannelRow title="Live Movies" items={moviesChannels(12)} onPressChannel={openChannel} />
                  <ChannelRow title="Live Series" items={seriesChannels(12)} onPressChannel={openChannel} />
                  <ChannelRow title="Live Sports" items={sportsChannels(12)} onPressChannel={openChannel} />
                </View>
              ) : items.length === 0 ? (
                <Txt size={13} color={colors.textDim} style={{ paddingHorizontal: layout.gutter, paddingBottom: 24 }}>
                  {loading ? 'Loading…' : 'Nothing here right now. Pull down to refresh.'}
                </Txt>
              ) : (
                items.map((t) => <Card key={`${s.key}-${t.id}`} title={t} mode={s.key === 'coming' || s.key === 'airing' ? 'coming' : 'play'} />)
              )}
            </View>
          );
        })}
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
  media: { borderRadius: radius.md, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
});
