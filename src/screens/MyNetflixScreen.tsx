import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { SheetItem } from '../components/ListItems';
import { ALogo } from '../components/Logo';
import { Poster, POSTER } from '../components/Poster';
import { ContinueRow, RowHeader, type ContinueItem } from '../components/Rows';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sheet } from '../components/Sheet';
import { Txt } from '../components/Txt';
import { findEpisode, type Title } from '../data/types';
import { resolveTitle, rowsByKey, useRows } from '../services/catalog';
import { useRootNav } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, layout, radius } from '../theme/tokens';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const RECOMMENDED = rowsByKey('cm-movies');

function MenuRow({ icon, color, label, detail, onPress }: { icon: IoniconName; color: string; label: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed ? { backgroundColor: colors.surface1 } : null]}>
      <View style={[styles.menuIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt weight="bold" size={16}>
          {label}
        </Txt>
        {detail ? (
          <Txt size={12} color={colors.textDim} style={{ marginTop: 2 }}>
            {detail}
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
    </Pressable>
  );
}

function SharedRow({ title, items, onPress, onSeeAll }: { title: string; items: Title[]; onPress: (t: Title) => void; onSeeAll?: () => void }) {
  return (
    <View style={{ marginTop: 26 }}>
      <RowHeader title={title} onSeeAll={onSeeAll} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(t) => t.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: 8 }}
        renderItem={({ item }) => (
          <View style={{ width: POSTER.width }}>
            <Poster title={item} onPress={onPress} />
            <Pressable
              onPress={() => Share.share({ message: `Check out "${item.name}" on AshTube` }).catch(() => undefined)}
              style={styles.share}
            >
              <Ionicons name="paper-plane-outline" size={16} color={colors.text} />
              <Txt weight="medium" size={12} style={{ marginLeft: 6 }}>
                Share
              </Txt>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

export default function MyNetflixScreen() {
  const nav = useRootNav();
  const { activeProfile, profileData, removeProgress, signOut, showToast, state } = useApp();
  const [menu, setMenu] = useState(false);
  const [continueMenuItem, setContinueMenuItem] = useState<ContinueItem | null>(null);
  const { rows } = useRows(RECOMMENDED);
  const recommended = rows.flatMap((r) => r.items).slice(0, 12);
  const open = useCallback((t: Title) => nav.navigate('Title', { id: t.id }), [nav]);

  const continueItems = useMemo<ContinueItem[]>(
    () =>
      profileData.progress
        .map((entry) => {
          const title = resolveTitle(entry.titleId);
          const ep = entry.episodeId ? findEpisode(title, entry.episodeId) : null;
          return { title, entry, label: ep ? `S${ep.season.number}:E${ep.episode.number}` : undefined };
        })
        .filter((i) => i.title.name !== 'Unavailable title'),
    [profileData.progress],
  );

  const playContinue = useCallback(
    (i: ContinueItem) => nav.navigate('Player', { id: i.title.id, episodeId: i.entry.episodeId }),
    [nav],
  );

  const liked = Object.entries(profileData.ratings)
    .filter(([, r]) => r !== 'down')
    .map(([id]) => resolveTitle(id));
  const myList = profileData.myList.map(resolveTitle);
  const downloadCount = new Set(profileData.downloads.map((d) => d.titleId)).size;

  const confirmSignOut = () => {
    setMenu(false);
    Alert.alert('Sign Out', 'Signing out of this app means you’ll also sign out of all other AshTube apps on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          signOut().then(() => nav.reset({ index: 0, routes: [{ name: 'Landing' }] }));
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="My AshTube" actions={['search', 'menu']} onMenu={() => setMenu(true)} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {activeProfile ? (
          <View style={styles.profile}>
            <Avatar profile={activeProfile} size={72} radius={6} />
            <View style={styles.profileName}>
              <Txt weight="bold" size={20}>
                {activeProfile.name}
              </Txt>
            </View>
          </View>
        ) : null}

        {/* Continue Watching (Relocated to Profile per requirement 15) */}
        {continueItems.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <ContinueRow
              title="Continue Watching"
              items={continueItems}
              onPlay={playContinue}
              onInfo={open}
              onMore={setContinueMenuItem}
            />
          </View>
        ) : null}

        {/* Prominent Live TV Entry Point */}
        <Pressable
          onPress={() => nav.navigate('LiveTv')}
          style={({ pressed }) => [styles.liveTvCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.liveTvLeft}>
            <View style={styles.liveTvIcon}>
              <Ionicons name="tv" size={24} color="#FFF" />
              <View style={styles.liveBadge}>
                <Txt weight="bold" size={9} color="#FFF">LIVE</Txt>
              </View>
            </View>
            <View style={styles.liveTvInfo}>
              <Txt weight="bold" size={16} color={colors.text}>Live TV Channels</Txt>
              <Txt size={12} color={colors.textDim} style={{ marginTop: 2 }}>
                4,400+ Free-to-Air Channels • News, Sports & Entertainment
              </Txt>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
        </Pressable>

        <MenuRow icon="notifications" color={colors.red} label="Notifications" detail="Live news channels"
          onPress={() => nav.navigate('Notifications')} />
        <MenuRow
          icon="download"
          color={colors.blue}
          label="Downloads"
          detail={downloadCount > 0 ? `${downloadCount} ${downloadCount === 1 ? 'title' : 'titles'}` : undefined}
          onPress={() => nav.navigate('Downloads')}
        />
        {/* Adult Content entry point */}
        <MenuRow
          icon="flame"
          color="#9B2C5A"
          label="Adult Content"
          detail="18+"
          onPress={() => nav.navigate('AdultContent')}
        />

        {liked.length > 0 ? <SharedRow title="TV Shows & Movies You've Liked" items={liked} onPress={open} /> : null}
        {myList.length > 0 ? <SharedRow title="My List" items={myList} onPress={open} onSeeAll={() => nav.navigate('MyList')} /> : null}
        {recommended.length > 0 ? <SharedRow title="Recommended For You" items={recommended} onPress={open} /> : null}

        {/* About Section with required credits */}
        <View style={styles.aboutCard}>
          <View style={styles.aboutHeader}>
            <ALogo size={26} />
            <Txt weight="extrabold" size={18} color={colors.red} style={{ marginLeft: 10 }}>
              ASHTUBE
            </Txt>
            <View style={styles.versionBadge}>
              <Txt size={10} color={colors.textDim} weight="semibold">v2.0.0</Txt>
            </View>
          </View>
          <View style={styles.aboutDivider} />
          <View style={styles.aboutCredits}>
            <View style={styles.creditItem}>
              <Txt size={11} color={colors.textMuted} weight="medium">
                DEVELOPED BY
              </Txt>
              <Txt size={15} color={colors.text} weight="bold" style={{ marginTop: 2 }}>
                Asraful Islam
              </Txt>
            </View>
            <View style={styles.creditItem}>
              <Txt size={11} color={colors.textMuted} weight="medium">
                HELPED BY
              </Txt>
              <Txt size={15} color={colors.text} weight="bold" style={{ marginTop: 2 }}>
                Sazzad Hossain
              </Txt>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Continue Watching Item Options Sheet */}
      <Sheet visible={continueMenuItem !== null} onClose={() => setContinueMenuItem(null)}>
        {continueMenuItem ? (
          <>
            <Txt weight="bold" size={16} style={styles.sheetTitle} numberOfLines={1}>
              {continueMenuItem.title.name}
              {continueMenuItem.label ? `  ${continueMenuItem.label}` : ''}
            </Txt>
            <SheetItem
              label="Episodes & Info"
              icon="information-circle-outline"
              onPress={() => {
                const item = continueMenuItem;
                setContinueMenuItem(null);
                open(item.title);
              }}
            />
            <SheetItem
              label="Remove From Continue Watching"
              icon="close-circle-outline"
              destructive
              onPress={() => {
                const item = continueMenuItem;
                removeProgress(item.title.id);
                setContinueMenuItem(null);
                showToast('Removed from Continue Watching');
              }}
            />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetItem label="App Settings" icon="settings-outline" onPress={() => { setMenu(false); nav.navigate('AppSettings'); }} />
        <SheetItem label="Account" icon="person-circle-outline" onPress={() => { setMenu(false); showToast(`Signed in as ${state.email || 'guest'}`); }} />
        <SheetItem label="Help" icon="help-circle-outline" onPress={() => { setMenu(false); showToast('Pull down on any screen to refresh content'); }} />
        <SheetItem label="Sign Out" icon="log-out-outline" onPress={confirmSignOut} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  profile: { alignItems: 'center', paddingVertical: 18 },
  profileName: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter + 4, paddingVertical: 12 },
  menuIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  share: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  sheetTitle: { paddingHorizontal: 20, paddingVertical: 10 },
  liveTvCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: layout.gutter,
    marginBottom: 16,
    padding: 14,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surface4,
  },
  liveTvLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  liveTvIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  liveBadge: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: '#000',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: colors.red,
  },
  liveTvInfo: { flex: 1, marginLeft: 14 },
  aboutCard: {
    marginHorizontal: layout.gutter,
    marginTop: 32,
    marginBottom: 16,
    padding: 18,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface4,
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surface4,
    borderRadius: 4,
  },
  aboutDivider: {
    height: 1,
    backgroundColor: colors.surface4,
    marginVertical: 14,
  },
  aboutCredits: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creditItem: {
    flex: 1,
  },
});
