import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { SheetItem } from '../components/ListItems';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { LANGUAGES } from '../services/playback';

import { SectionLabel, SettingRow } from '../components/ListItems';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { clearPersistentCache } from '../services/cache';
import { pickDownloadFolder } from '../services/downloads';
import { useApp } from '../state/AppState';
import { colors } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'AppSettings'>;

export default function AppSettingsScreen({ navigation }: Props) {
  const { state, toggleSetting, setSetting, showToast, profileData, deleteDownload, signOut } = useApp();
  const s = state.settings;
  const checkSources = async () => {
    showToast('Checking sources…');
    const targets = [
      'https://southfreak.club/wp-json/',
      'http://amaderftp.net/',
      'https://graphql.anilist.co',
      'https://v3-cinemeta.strem.io/manifest.json',
    ];
    const started = Date.now();
    const ok = await Promise.all(
      targets.map((u) =>
        Promise.race([fetch(u, { method: 'GET', headers: { Range: 'bytes=0-64' } }).then((r) => r.status < 500), new Promise<boolean>((r) => setTimeout(() => r(false), 8000))]).catch(() => false),
      ),
    );
    showToast(`${ok.filter(Boolean).length}/${targets.length} sources online (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  };

  const [picker, setPicker] = useState<{ title: string; options: { label: string; value: string | number }[]; current: string | number; onSelect: (v: string | number) => void } | null>(null);

  const pickStreamingQuality = () =>
    setPicker({
      title: 'Preferred Streaming Quality',
      current: s.defaultStreamingQuality,
      options: [
        { label: 'Auto (highest available)', value: 'auto' },
        { label: '1080p (Full HD)', value: '1080p' },
        { label: '720p (HD)', value: '720p' },
        { label: '480p (Data Saver)', value: '480p' },
      ],
      onSelect: (v) => setSetting('defaultStreamingQuality', v as typeof s.defaultStreamingQuality),
    });

  const pickDownloadQuality = () =>
    setPicker({
      title: 'Preferred Download Quality',
      current: s.defaultDownloadQuality,
      options: [
        { label: '1080p (High quality)', value: '1080p' },
        { label: '720p (Standard HD)', value: '720p' },
        { label: '480p (Smaller file)', value: '480p' },
      ],
      onSelect: (v) => setSetting('defaultDownloadQuality', v as typeof s.defaultDownloadQuality),
    });

  const chooseFolder = async () => {
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

  const pickThreads = () =>
    setPicker({
      title: 'Download Connections',
      current: s.downloadThreads,
      options: [1, 2, 4, 6, 8, 12, 16].map((n) => ({ label: n === 1 ? '1 (single stream)' : `${n} parallel connections`, value: n })),
      onSelect: (v) => setSetting('downloadThreads', Number(v)),
    });

  const pickLanguage = () =>
    setPicker({
      title: 'Preferred Language',
      current: s.preferredLanguage,
      options: LANGUAGES.map((l) => ({ label: l.label, value: l.label })),
      onSelect: (v) => setSetting('preferredLanguage', String(v)),
    });

  return (
    <View style={styles.root}>
      <ScreenHeader title="App Settings" back />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionLabel>Video Playback & Gestures</SectionLabel>
        <SettingRow
          icon="hand-left-outline"
          label="Swipe Gestures"
          description="Swipe left edge for brightness, right edge for volume, horizontal to scrub."
          toggle={s.swipeGestures}
          onToggle={() => toggleSetting('swipeGestures')}
        />
        <SettingRow
          icon="flash-outline"
          label="Double-Tap to Seek"
          description="Double-tap left or right side of screen to jump 10 seconds."
          toggle={s.doubleTapSeek}
          onToggle={() => toggleSetting('doubleTapSeek')}
        />
        <SettingRow
          icon="videocam-outline"
          label="Default Video Quality"
          value={s.defaultStreamingQuality.toUpperCase()}
          onPress={pickStreamingQuality}
        />
        <SettingRow
          icon="language-outline"
          label="Preferred Language"
          value={s.preferredLanguage}
          onPress={pickLanguage}
        />
        <SettingRow icon="play-forward-outline" label="Autoplay Next Episode" toggle={s.autoplayNext} onToggle={() => toggleSetting('autoplayNext')} />

        <SettingRow
          icon="cellular-outline"
          label="Data Saver"
          description="Stops background source checks and pre-loading, and keeps streams at 720p or below."
          toggle={s.dataSaver}
          onToggle={() => toggleSetting('dataSaver')}
        />

        <SectionLabel>Downloads</SectionLabel>
        <SettingRow
          icon="download-outline"
          label="Download Video Quality"
          value={s.defaultDownloadQuality.toUpperCase()}
          onPress={pickDownloadQuality}
        />
        <SettingRow
          icon="folder-outline"
          label="Download Location"
          value={s.downloadDir ? s.downloadDir.name : 'App storage (offline library)'}
          description="Pick any folder on your phone or SD card. Tap again to change it."
          onPress={chooseFolder}
        />
        {s.downloadDir ? (
          <SettingRow icon="refresh-outline" label="Use App Storage Again" onPress={() => { setSetting('downloadDir', null); showToast('Downloads will use app storage'); }} />
        ) : null}
        <SettingRow
          icon="git-network-outline"
          label="Download Connections"
          value={`${s.downloadThreads} parallel connections`}
          description="More connections finish big files faster on servers that allow them."
          onPress={pickThreads}
        />
        <SettingRow
          icon="trash-outline"
          label="Delete All Downloads"
          onPress={() =>
            Alert.alert('Delete All Downloads', 'Are you sure you want to delete all of your downloads?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  new Set(profileData.downloads.map((d) => d.titleId)).forEach((id) => deleteDownload(id));
                  showToast('All downloads deleted');
                },
              },
            ])
          }
        />

        <SectionLabel>Diagnostics</SectionLabel>
        <SettingRow icon="speedometer-outline" label="Check Sources" description="Pings every content source and reports how many are reachable." onPress={checkSources} />
        <SettingRow
          icon="refresh-outline"
          label="Clear Content Cache"
          description="Forces fresh lists from every source on next open."
          onPress={() => clearPersistentCache().then(() => showToast('Cache cleared'))}
        />

        <SectionLabel>About</SectionLabel>
        <SettingRow icon="phone-portrait-outline" label="Version" value="AshTube 2.0.0" />
        <SettingRow
          icon="log-out-outline"
          label="Sign Out"
          onPress={() => {
            signOut().then(() => navigation.reset({ index: 0, routes: [{ name: 'Landing' }] }));
          }}
        />
      </ScrollView>
      <Sheet visible={picker !== null} onClose={() => setPicker(null)}>
        {picker ? (
          <>
            <Txt weight="bold" size={16} style={{ paddingHorizontal: 20, paddingVertical: 10 }}>{picker.title}</Txt>
            {picker.options.map((o) => (
              <SheetItem
                key={String(o.value)}
                label={o.label}
                icon={o.value === picker.current ? 'checkmark-circle' : 'ellipse-outline'}
                onPress={() => {
                  picker.onSelect(o.value);
                  setPicker(null);
                }}
              />
            ))}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
