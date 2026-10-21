import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from '../components/Img';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, ProgressBar } from '../components/Buttons';
import { ScreenHeader } from '../components/ScreenHeader';
import { Txt } from '../components/Txt';
import { findEpisode } from '../data/types';
import { resolveTitle } from '../services/catalog';
import type { RootStackParamList } from '../navigation/types';
import { useApp, type DownloadEntry } from '../state/AppState';
import { colors, radius } from '../theme/tokens';
import { freeSpaceMB } from '../services/downloads';
import { formatSize } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Downloads'>;

export default function DownloadsScreen({ navigation }: Props) {
  const { profileData, activeProfile, deleteDownload, startDownload, showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [freeMB, setFreeMB] = useState(0);
  useEffect(() => {
    freeSpaceMB().then(setFreeMB);
  }, [profileData.downloads.length]);

  const entries = profileData.downloads;

  const usedMB = useMemo(
    () =>
      entries.reduce(
        (sum, d) => sum + (d.status === 'downloaded' ? d.sizeMB : d.sizeMB * Math.max(0.05, d.progress)),
        0,
      ),
    [entries],
  );

  const handleEntryPress = (d: DownloadEntry) => {
    if (editing) {
      deleteDownload(d.titleId, d.episodeId);
      showToast('Download deleted');
      return;
    }
    if (d.status === 'failed') {
      startDownload(d.titleId, d.episodeId);
      return;
    }
    if (d.status === 'downloading') {
      showToast(`Downloading… ${Math.round(d.progress * 100)}%`);
      return;
    }
    navigation.navigate('Player', { id: d.titleId, episodeId: d.episodeId });
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        back
        left={
          <View style={styles.headerLeft}>
            <Txt weight="bold" size={18} style={{ flex: 1 }}>
              Downloads
            </Txt>
            {entries.length > 0 ? (
              <Pressable hitSlop={10} onPress={() => setEditing((e) => !e)}>
                {editing ? (
                  <Txt weight="bold" size={15}>
                    Done
                  </Txt>
                ) : (
                  <Ionicons name="pencil" size={20} color={colors.text} />
                )}
              </Pressable>
            ) : null}
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {entries.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyCircle}>
              <Ionicons name="download-outline" size={72} color={colors.textDim} />
            </View>
            <Txt weight="bold" size={20} align="center" style={{ marginTop: 26 }}>
              Movies and TV shows that you download appear here.
            </Txt>
            <Button
              label="See What You Can Download"
              variant="white"
              height={44}
              style={{ marginTop: 28 }}
              onPress={() => navigation.navigate('Main', { screen: 'Home' })}
            />
          </View>
        ) : (
          <>
            {activeProfile ? (
              <Txt weight="semibold" size={14} color={colors.textMuted} style={styles.profileLabel}>
                Downloads for {activeProfile.name} ({entries.length})
              </Txt>
            ) : null}
            {entries.map((d) => {
              const title = resolveTitle(d.titleId);
              const foundEp = d.episodeId ? findEpisode(title, d.episodeId) : null;
              const downloading = d.status === 'downloading';
              const failed = d.status === 'failed';
              const epLabel = foundEp
                ? `S${foundEp.season.number}:E${foundEp.episode.number} • ${foundEp.episode.name}`
                : undefined;
              const sizeLabel = formatSize(
                d.status === 'downloaded' ? d.sizeMB : Math.max(1, d.sizeMB * Math.max(0.05, d.progress)),
              );
              const detail = `${title.year} | ${sizeLabel} • Offline ready`;

              return (
                <Pressable
                  key={`${d.titleId}-${d.episodeId ?? 'movie'}`}
                  onPress={() => handleEntryPress(d)}
                  style={({ pressed }) => [styles.item, pressed ? { backgroundColor: colors.surface1 } : null]}
                >
                  <View style={styles.thumb}>
                    <Image
                      source={(() => {
                        const uri = foundEp?.episode.still || title.background || title.poster;
                        return uri ? { uri } : undefined;
                      })()}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    {!downloading && !failed ? (
                      <View style={styles.thumbPlay}>
                        <Ionicons name="play" size={16} color={colors.text} style={{ marginLeft: 2 }} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Txt weight="semibold" size={15} numberOfLines={1}>
                      {title.name}
                    </Txt>
                    {epLabel ? (
                      <Txt size={12} color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
                        {epLabel}
                      </Txt>
                    ) : null}
                    <Txt size={12} color={failed ? colors.redLight : colors.textDim} style={{ marginTop: 4 }}>
                      {downloading
                        ? `${d.server ? `${d.server} • ` : ''}${Math.round(d.progress * 100)}%${d.speed ? ` • ${(d.speed / (1024 * 1024)).toFixed(1)} MB/s` : ''}`
                        : failed
                          ? 'Interrupted • Tap to resume'
                          : detail}
                    </Txt>
                    {downloading ? <ProgressBar value={d.progress} height={3} style={{ marginTop: 6 }} /> : null}
                  </View>
                  {editing ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() => {
                        deleteDownload(d.titleId, d.episodeId);
                        showToast('Download deleted');
                      }}
                    >
                      <Ionicons name="trash-outline" size={22} color={colors.redLight} />
                    </Pressable>
                  ) : downloading ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() => {
                        deleteDownload(d.titleId, d.episodeId);
                        showToast('Download cancelled');
                      }}
                      style={styles.cancelWrap}
                    >
                      <ActivityIndicator size="small" color={colors.blue} />
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} style={{ marginLeft: 6 }} />
                    </Pressable>
                  ) : failed ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() => startDownload(d.titleId, d.episodeId)}
                    >
                      <Ionicons name="refresh-circle-outline" size={26} color={colors.redLight} />
                    </Pressable>
                  ) : (
                    <Pressable
                      hitSlop={10}
                      onPress={() => {
                        deleteDownload(d.titleId, d.episodeId);
                        showToast('Download deleted');
                      }}
                    >
                      <Ionicons name="checkmark-circle" size={24} color={colors.blue} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
            <Button
              label="Find More to Download"
              variant="gray"
              height={44}
              style={styles.more}
              onPress={() => navigation.navigate('Main', { screen: 'Home' })}
            />
          </>
        )}
      </ScrollView>
      <View style={styles.storage}>
        <View style={styles.storageBar}>
          <View style={{ flex: Math.max(1, usedMB), backgroundColor: colors.blue }} />
          <View style={{ flex: Math.max(1, freeMB), backgroundColor: colors.surface6 }} />
        </View>
        <View style={styles.storageLegend}>
          <Txt size={11} color={colors.textMuted}>MythTube • {formatSize(usedMB)}</Txt>
          <Txt size={11} color={colors.textMuted}>Free • {freeMB > 0 ? formatSize(freeMB) : '—'}</Txt>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  smart: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyCircle: { width: 170, height: 170, borderRadius: 85, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  profileLabel: { paddingHorizontal: 16, marginTop: 6, marginBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  thumb: { width: 128, height: 72, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  thumbPlay: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.text, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  cancelWrap: { flexDirection: 'row', alignItems: 'center' },
  more: { alignSelf: 'center', marginTop: 24 },
  storage: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface1 },
  storageBar: { height: 4, flexDirection: 'row', borderRadius: 2, overflow: 'hidden' },
  storageLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
