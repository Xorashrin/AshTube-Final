import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Episode, Title } from '../data/types';
import { pickDownloadFolder } from '../services/downloads';
import { useSourceSearch, type Server } from '../services/playback';
import { useApp } from '../state/AppState';
import { colors } from '../theme/tokens';
import { Sheet } from './Sheet';
import { Txt } from './Txt';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: Title;
  episode?: Episode;
  onStart: (serverId?: string) => void;
}

/** Download dialog: automatic (fastest verified server) or a specific server, plus the target folder. */
export function DownloadSheet({ visible, onClose, title, episode, onStart }: Props) {
  const { state, setSetting, showToast } = useApp();
  const { engine, version } = useSourceSearch(title, episode);
  const verified = useMemo(() => new Map(engine.ranked(true).map((r) => [r.server.id, r])), [engine, version]);
  const servers = useMemo<Server[]>(
    () => [...engine.downloadable].sort((a, b) => Number(verified.has(b.id)) - Number(verified.has(a.id)) || b.rank - a.rank).slice(0, 14),
    [engine, version, verified],
  );
  const searching = !engine.done;
  const dir = state.settings.downloadDir;

  const changeFolder = async () => {
    try {
      const picked = await pickDownloadFolder();
      if (picked) {
        setSetting('downloadDir', picked);
        showToast(`Downloads will be saved to ${picked.name}`);
      }
    } catch {
      showToast('Could not open the folder picker');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt weight="bold" size={16} style={styles.heading} numberOfLines={1}>
        Download {episode ? `${title.name} S${episode.season}:E${episode.number}` : title.name}
      </Txt>
      <ScrollView style={{ maxHeight: 340 }}>
        <Pressable
          onPress={() => {
            onClose();
            onStart(undefined);
          }}
          style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        >
          <Ionicons name="flash" size={22} color={colors.blue} style={styles.icon} />
          <View style={{ flex: 1 }}>
            <Txt weight="bold" size={15}>Automatic (recommended)</Txt>
            <Txt size={12} color={colors.textMuted}>Fastest verified server at the highest quality</Txt>
          </View>
        </Pressable>
        {servers.map((s) => {
          const ok = verified.get(s.id);
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                onClose();
                onStart(s.id);
              }}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <Ionicons name={ok ? 'checkmark-circle' : 'cloud-download-outline'} size={22} color={ok ? colors.success : colors.textDim} style={styles.icon} />
              <View style={{ flex: 1 }}>
                <Txt weight="semibold" size={14} numberOfLines={1}>{s.name}</Txt>
                <Txt size={12} color={colors.textMuted} numberOfLines={1}>
                  {[s.size, s.detail, ok ? (ok.playable.seekable ? 'multi-thread' : 'single stream') : 'not checked yet'].filter(Boolean).join(' • ')}
                </Txt>
              </View>
            </Pressable>
          );
        })}
        {searching ? (
          <View style={styles.searching}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Txt size={12} color={colors.textMuted} style={{ marginLeft: 10 }}>Still looking for more servers…</Txt>
          </View>
        ) : servers.length === 0 ? (
          <Txt size={13} color={colors.textMuted} style={{ padding: 20 }}>No downloadable server was found for this title.</Txt>
        ) : null}
      </ScrollView>
      <Pressable onPress={changeFolder} style={({ pressed }) => [styles.folder, pressed ? styles.pressed : null]}>
        <Ionicons name="folder-open-outline" size={20} color={colors.text} style={styles.icon} />
        <View style={{ flex: 1 }}>
          <Txt weight="semibold" size={13}>Save to</Txt>
          <Txt size={12} color={colors.textMuted} numberOfLines={1}>{dir ? dir.name : 'App storage (offline library)'}</Txt>
        </View>
        <Txt weight="bold" size={13} color={colors.blue}>Change</Txt>
      </Pressable>
      <Txt size={11} color={colors.textDim} style={styles.footnote}>
        {state.settings.downloadThreads} parallel connections per download
      </Txt>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 20, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  pressed: { backgroundColor: colors.surface4 },
  icon: { marginRight: 14 },
  searching: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  folder: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface6 },
  footnote: { paddingHorizontal: 20, paddingBottom: 6 },
});
