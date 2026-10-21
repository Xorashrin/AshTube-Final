import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { SectionLabel, SettingRow } from '../components/ListItems';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { clearPersistentCache } from '../services/cache';
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

  const pickStreamingQuality = () => {
    Alert.alert('Default Streaming Quality', 'Choose preferred streaming resolution:', [
      { text: 'Auto', onPress: () => setSetting('defaultStreamingQuality', 'auto') },
      { text: '1080p (Full HD)', onPress: () => setSetting('defaultStreamingQuality', '1080p') },
      { text: '720p (HD)', onPress: () => setSetting('defaultStreamingQuality', '720p') },
      { text: '480p (Data Saver)', onPress: () => setSetting('defaultStreamingQuality', '480p') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickDownloadQuality = () => {
    Alert.alert('Default Download Quality', 'Choose default download video quality:', [
      { text: '1080p (High Quality)', onPress: () => setSetting('defaultDownloadQuality', '1080p') },
      { text: '720p (Standard HD)', onPress: () => setSetting('defaultDownloadQuality', '720p') },
      { text: '480p (Smaller File)', onPress: () => setSetting('defaultDownloadQuality', '480p') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickLanguage = () => {
    Alert.alert('Preferred Audio Language', 'Choose preferred audio track for multi-audio titles:', [
      { text: 'English (Original)', onPress: () => setSetting('preferredLanguage', 'English') },
      { text: 'Hindi', onPress: () => setSetting('preferredLanguage', 'Hindi') },
      { text: 'Bengali', onPress: () => setSetting('preferredLanguage', 'Bengali') },
      { text: 'Spanish', onPress: () => setSetting('preferredLanguage', 'Spanish') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
          label="Preferred Audio Language"
          value={s.preferredLanguage}
          onPress={pickLanguage}
        />
        <SettingRow icon="play-forward-outline" label="Autoplay Next Episode" toggle={s.autoplayNext} onToggle={() => toggleSetting('autoplayNext')} />

        <SectionLabel>Downloads</SectionLabel>
        <SettingRow
          icon="download-outline"
          label="Download Video Quality"
          value={s.defaultDownloadQuality.toUpperCase()}
          onPress={pickDownloadQuality}
        />
        <SettingRow icon="folder-outline" label="Download Location" value="App storage (offline library)" />
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
        <SettingRow icon="phone-portrait-outline" label="Version" value="MythTube 2.0.0" />
        <SettingRow
          icon="log-out-outline"
          label="Sign Out"
          onPress={() => {
            signOut().then(() => navigation.reset({ index: 0, routes: [{ name: 'Landing' }] }));
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
