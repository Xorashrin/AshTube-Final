import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ChannelRow } from '../components/ChannelRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import { VodPoster, VOD_POSTER } from '../components/VodPoster';
import { VodRow } from '../components/VodRow';
import { adultChannels, adultVodTitles, type Channel } from '../data/channels';
import type { VodTitle } from '../data/vod';
import type { RootStackParamList } from '../navigation/types';
import { colors, layout } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'AdultContent'>;

const AGE_GATE_KEY = 'mythtube:adult-confirmed-v1';

// Curated discovery rows — titles are grouped by keyword matches in their real
// scraped names (no made-up categories). Order matters: a title can appear in
// more than one row, same as Home's genre rows.
const VOD_GROUPS: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'desi', label: 'Desi & Indian', pattern: /indian|desi|bhabhi|aunty|hindi|tamil|mallu|bengali|south ?indian/i },
  { key: 'bd', label: 'Bangladeshi', pattern: /bangladeshi|bangla\b/i },
  { key: 'hardcore', label: 'Hardcore', pattern: /hardcore|hard ?fuck|rough/i },
  { key: 'teen', label: 'Teen & College', pattern: /teen|college|young|schoolgirl/i },
  { key: 'amateur', label: 'Amateur & Homemade', pattern: /amateur|homemade|mms|scandal/i },
  { key: 'asian', label: 'Asian', pattern: /asian|japanese|korean|chinese|pakistani/i },
];
const MIN_ROW_SIZE = 6;

// Live channels split into the per-category feeds (cdn.adultiptv.net) and the
// named premium channels (Brazzers, Dorcel, Desire, Erox…) scraped from GitHub
// IPTV lists. Both groups are re-probed before being bundled — see
// tools/build_channels.py and the AdultIPTV augmentation pass.
function splitChannels(channels: Channel[]) {
  const category = channels.filter((c) => c.name.startsWith('AdultIPTV '));
  const premium = channels.filter((c) => !c.name.startsWith('AdultIPTV '));
  return { category, premium };
}

/**
 * AdultContentScreen — dedicated 18+ section with Netflix-style curated rows
 * (Live Category Feeds, Premium Live Channels, Trending, Desi & Indian,
 * Bangladeshi, Hardcore, Teen & College, Amateur & Homemade) on top of the
 * full browsable library. Gated by a one-time age confirmation (persisted
 * in AsyncStorage). All streams come from the real backend (channels.json +
 * adult_vod.ts) — nothing here is a mock.
 */
export default function AdultContentScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(true);
  const channels = useMemo(() => adultChannels(), []);
  const vod = useMemo(() => adultVodTitles(200), []);
  const { category: categoryChannels, premium: premiumChannels } = useMemo(() => splitChannels(channels), [channels]);
  const vodGroups = useMemo(
    () =>
      VOD_GROUPS.map((g) => ({ ...g, items: vod.filter((t) => g.pattern.test(t.name)) })).filter(
        (g) => g.items.length >= MIN_ROW_SIZE,
      ),
    [vod],
  );
  const vodCell = Math.floor((width - layout.gutter * 2 - 8 * 2) / 3);

  // one-time age gate
  React.useEffect(() => {
    (async () => {
      try {
        const ok = await AsyncStorage.getItem(AGE_GATE_KEY);
        if (ok === '1') setConfirmed(true);
      } catch {
        // ignore
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const confirm = async () => {
    try {
      await AsyncStorage.setItem(AGE_GATE_KEY, '1');
    } catch {
      // ignore
    }
    setConfirmed(true);
  };

  const leave = () => navigation.goBack();

  if (checking) {
    return <View style={styles.root} />;
  }

  if (!confirmed) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Adult Content" back />
        <View style={styles.gateRoot}>
          <Txt weight="bold" size={22} align="center">
            Adults Only (18+)
          </Txt>
          <Txt size={14} color={colors.textMuted} align="center" style={{ marginTop: 12, paddingHorizontal: 16 }}>
            This section contains mature content. By continuing, you confirm that you are at least 18 years old and that viewing such material is legal in your jurisdiction.
          </Txt>
          <View style={styles.gateButtons}>
            <Pressable style={[styles.btn, styles.btnOutline]} onPress={leave}>
              <Txt weight="bold" size={14}>
                Take me back
              </Txt>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnSolid]} onPress={confirm}>
              <Txt weight="bold" size={14} color={colors.bg}>
                I'm 18 or older
              </Txt>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (channels.length === 0 && vod.length === 0) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Adult Content" back />
        <View style={styles.gateRoot}>
          <Txt weight="bold" size={18} align="center">
            No adult channels available right now.
          </Txt>
          <Txt size={13} color={colors.textMuted} align="center" style={{ marginTop: 8, paddingHorizontal: 24 }}>
            The backend will refresh on the next scrape cycle.
          </Txt>
        </View>
      </View>
    );
  }

  const openVod = (t: VodTitle) => navigation.navigate('Title', { id: t.id });
  const openChannel = (c: Channel) => navigation.navigate('Live', { channelId: c.id, filter: 'Adult' });

  return (
    <View style={styles.root}>
      <ScreenHeader title="Adult Content" back />
      <FlatList
        key={vod.length}
        data={vod}
        keyExtractor={(c) => c.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={5}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ paddingBottom: 8 }}>
            {categoryChannels.length > 0 ? (
              <ChannelRow title="🔴 Live Category Feeds" items={categoryChannels} onPressChannel={openChannel} />
            ) : null}
            {premiumChannels.length > 0 ? (
              <ChannelRow title="🔴 Premium Live Channels" items={premiumChannels} onPressChannel={openChannel} />
            ) : null}
            <VodRow title="Trending Adult VOD" items={vod.slice(0, 20)} onPressTitle={openVod} />
            {vodGroups.map((g) => (
              <VodRow key={g.key} title={g.label} items={g.items.slice(0, 20)} onPressTitle={openVod} />
            ))}
            <View style={styles.header}>
              <Txt weight="bold" size={16}>
                All Adult Videos
              </Txt>
              <Txt size={12} color={colors.textDim} style={{ marginTop: 4 }}>
                {vod.length} real full-length videos · {channels.length} live stream(s) · scraped from public sources
              </Txt>
            </View>
          </View>
        }
        renderItem={({ item }: { item: VodTitle }) => (
          <View style={{ width: vodCell }}>
            <VodPoster title={item} width={vodCell} height={vodCell * 1.45} onPress={openVod} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  gateRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  gateButtons: { flexDirection: 'row', gap: 12, marginTop: 28 },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, minWidth: 130, alignItems: 'center' },
  btnOutline: { borderWidth: 1, borderColor: colors.text },
  btnSolid: { backgroundColor: colors.text },
  header: { paddingHorizontal: layout.gutter, paddingTop: 28, paddingBottom: 8 },
  grid: { paddingBottom: 30, gap: 16 },
  row: { gap: 8, paddingHorizontal: layout.gutter },
});
