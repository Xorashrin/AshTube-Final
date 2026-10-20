import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ChannelLogo } from '../components/ChannelLogo';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import { VodPoster, VOD_POSTER } from '../components/VodPoster';
import { adultChannels, adultVodTitles, type Channel } from '../data/channels';
import type { VodTitle } from '../data/vod';
import type { RootStackParamList } from '../navigation/types';
import { colors, layout } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'AdultContent'>;

const AGE_GATE_KEY = 'mythtube:adult-confirmed-v1';

/**
 * AdultContentScreen — dedicated section for 18+ live channels (requirement 9).
 * Gated by a one-time age confirmation (persisted in AsyncStorage).
 * Streams come from the real backend (channels.json) — Adult category only.
 */
export default function AdultContentScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(true);
  const channels = useMemo(() => adultChannels(), []);
  const vod = useMemo(() => adultVodTitles(150), []);
  const cell = Math.floor((width - layout.gutter * 2 - 8 * 2) / 3);
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
          <View style={styles.header}>
            <Txt weight="bold" size={16}>
              Adult VOD · 18+
            </Txt>
            <Txt size={12} color={colors.textDim} style={{ marginTop: 4 }}>
              {vod.length} real full-length videos · scraped from public sources
            </Txt>
          </View>
        }
        renderItem={({ item }: { item: VodTitle }) => (
          <Pressable
            onPress={() => openVod(item)}
            style={({ pressed }) => [{ width: vodCell, opacity: pressed ? 0.7 : 1 }]}
          >
            <VodPoster title={item} width={vodCell} height={vodCell * 1.45} onPress={openVod} />
          </Pressable>
        )}
        ListFooterComponent={
          channels.length > 0 ? (
            <View style={styles.liveFooter}>
              <Txt weight="bold" size={16}>
                Live Adult Channels
              </Txt>
              <Txt size={12} color={colors.textDim} style={{ marginTop: 4, marginBottom: 12 }}>
                {channels.length} live IPTV stream(s)
              </Txt>
              <FlatList
                data={channels}
                keyExtractor={(c) => c.id}
                numColumns={3}
                columnWrapperStyle={styles.row}
                scrollEnabled={false}
                renderItem={({ item }: { item: Channel }) => (
                  <Pressable
                    onPress={() => navigation.navigate('Live', { channelId: item.id, filter: 'Adult' })}
                    style={({ pressed }) => [{ width: cell, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ChannelLogo channel={item} size={cell} />
                    <Txt weight="medium" size={12} numberOfLines={1} style={{ marginTop: 6 }}>
                      {item.name}
                    </Txt>
                  </Pressable>
                )}
              />
            </View>
          ) : <></>
        }
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
  header: { paddingHorizontal: layout.gutter, paddingTop: 12, paddingBottom: 8 },
  liveFooter: { paddingHorizontal: layout.gutter, paddingTop: 28, paddingBottom: 16 },
  grid: { paddingBottom: 30, gap: 16 },
  row: { gap: 8, paddingHorizontal: layout.gutter },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red, marginRight: 5 },
});
