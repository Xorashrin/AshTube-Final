import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useRootNav } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors } from '../theme/tokens';
import { Avatar } from './Avatar';
import { SheetItem } from './ListItems';
import { Sheet } from './Sheet';
import { Txt } from './Txt';

export function ProfileSwitchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, selectProfile, showToast } = useApp();
  const nav = useRootNav();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt weight="bold" size={16} align="center" style={{ marginVertical: 8 }}>
        Switch Profiles
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {state.profiles.map((p) => {
          const active = p.id === state.activeProfileId;
          return (
            <Pressable
              key={p.id}
              style={styles.profile}
              onPress={() => {
                onClose();
                if (!active) {
                  selectProfile(p.id);
                  showToast(`Switched to ${p.name}`);
                  nav.navigate('Main', { screen: 'Home' });
                }
              }}
            >
              <View style={[styles.avatarRing, active ? styles.activeRing : null]}>
                <Avatar profile={p} size={64} />
              </View>
              <Txt weight={active ? 'bold' : 'regular'} size={13} color={active ? colors.text : colors.textMuted} style={{ marginTop: 6 }}>
                {p.name}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      <SheetItem
        label="Manage Profiles"
        icon="pencil"
        onPress={() => {
          onClose();
          nav.navigate('Profiles', { mode: 'manage' });
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  profile: { alignItems: 'center', width: 72 },
  avatarRing: { padding: 2, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  activeRing: { borderColor: colors.text },
});
