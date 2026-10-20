// GamesScreen removed (requirement 4: replace Games tab with TV tab).
// File kept as a stub so any stale imports don't break the build.
import React from 'react';
import { View } from 'react-native';
import { Txt } from '../components/Txt';
import { colors } from '../theme/tokens';

export default function GamesScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
      <Txt>This screen has been retired. Open the TV tab instead.</Txt>
    </View>
  );
}
