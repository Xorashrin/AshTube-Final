import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Wordmark } from '../components/Logo';
import { Txt } from '../components/Txt';
import type { Profile } from '../data/mock';
import type { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, motion } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Profiles'>;

const AVATAR = 104;

function ProfileTile({ profile, editing, selected, dimmed, onPress }: { profile: Profile; editing: boolean; selected: boolean; dimmed: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (selected) scale.value = withTiming(1.12, { duration: motion.slow, easing: motion.decelerate });
  }, [selected, scale]);
  return (
    <Pressable onPress={onPress} style={[styles.tile, dimmed ? { opacity: 0.35 } : null]}>
      <Animated.View style={style}>
        <Avatar profile={profile} size={AVATAR} />
        {editing ? (
          <View style={styles.editOverlay}>
            <Ionicons name="pencil" size={30} color={colors.text} />
          </View>
        ) : null}
      </Animated.View>
      <View style={styles.nameRow}>
        <Txt size={14} color={colors.text90}>
          {profile.name}
        </Txt>
      </View>
    </Pressable>
  );
}

export default function ProfilesScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const manage = route.params?.mode === 'manage';
  const { state, selectProfile, showToast } = useApp();
  const [editing, setEditing] = useState(manage);
  const [selected, setSelected] = useState<string | null>(null);

  const choose = (p: Profile) => {
    if (editing) {
      showToast(`Editing ${p.name} arrives in the next phase`);
      return;
    }
    if (selected) return;
    setSelected(p.id);
    selectProfile(p.id);
    setTimeout(() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }), 650);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        {manage ? (
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.side}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.side} />
        )}
        {editing ? (
          <Txt weight="bold" size={18}>
            Manage Profiles
          </Txt>
        ) : (
          <Wordmark size={30} />
        )}
        <Pressable hitSlop={10} onPress={() => setEditing((e) => !e)} style={[styles.side, { alignItems: 'flex-end' }]}>
          {editing ? (
            <Txt weight="bold" size={15}>
              Done
            </Txt>
          ) : (
            <Ionicons name="pencil" size={22} color={colors.text} />
          )}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Txt weight="medium" size={20} align="center" style={{ marginBottom: 28 }}>
          {editing ? 'Choose a profile to edit' : "Who's Watching?"}
        </Txt>
        <View style={styles.grid}>
          {state.profiles.map((p) => (
            <ProfileTile key={p.id} profile={p} editing={editing} selected={selected === p.id} dimmed={selected !== null && selected !== p.id} onPress={() => choose(p)} />
          ))}
          {state.profiles.length < 5 ? (
            <Pressable style={styles.tile} onPress={() => showToast('Adding profiles arrives in the next phase')}>
              <View style={styles.add}>
                <Ionicons name="add" size={44} color={colors.textMuted} />
              </View>
              <Txt size={14} color={colors.text90} style={{ marginTop: 8 }}>
                Add Profile
              </Txt>
            </Pressable>
          ) : null}
        </View>
        {selected ? <ActivityIndicator color={colors.red} size="large" style={{ marginTop: 28 }} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  side: { width: 60 },
  content: { paddingTop: 36, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 28, rowGap: 22, paddingHorizontal: 40 },
  tile: { alignItems: 'center', width: AVATAR },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  editOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  add: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.surface6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
