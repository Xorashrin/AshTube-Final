import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useApp } from '../state/AppState';
import { colors, motion } from '../theme/tokens';
import { ALogo } from './Logo';
import { Txt } from './Txt';

/** Shown once after the first sign-in. No close button: tapping outside the card dismisses it. */
export function CreditPopup() {
  const { state, markCreditSeen } = useApp();
  const visible = state.hydrated && state.signedIn && !state.creditSeen;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) Animated.timing(scale, { toValue: 1, duration: motion.slow, easing: motion.decelerate, useNativeDriver: true }).start();
  }, [visible, scale]);

  const cardStyle = { transform: [{ scale }], opacity: scale.interpolate({ inputRange: [0.9, 1], outputRange: [0, 1] }) };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={markCreditSeen}>
      <Pressable style={styles.backdrop} onPress={markCreditSeen}>
        {/* The card absorbs touches so only taps on the empty area close the popup. */}
        <Animated.View style={[styles.card, cardStyle]} onStartShouldSetResponder={() => true}>
          <ALogo size={44} />
          <View style={styles.divider} />
          <Txt size={12} color={colors.textMuted} spacing={2} align="center">
            DEVELOPED BY
          </Txt>
          <Txt weight="black" size={20} align="center" spacing={1} style={{ marginTop: 4 }}>
            ASRAFUL ISLAM
          </Txt>
          <View style={{ height: 14 }} />
          <Txt size={12} color={colors.textMuted} spacing={2} align="center">
            HELPED BY
          </Txt>
          <Txt weight="black" size={20} align="center" spacing={1} style={{ marginTop: 4 }}>
            SAZZAD HOSSAIN
          </Txt>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  divider: { width: 40, height: 3, borderRadius: 2, backgroundColor: colors.red, marginVertical: 16 },
});
