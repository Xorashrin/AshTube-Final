import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../state/AppState';
import { motion } from '../theme/tokens';
import { Txt } from './Txt';

export function Toast() {
  const { state, clearToast } = useApp();
  const insets = useSafeAreaInsets();
  const visible = useSharedValue(0);
  const toast = state.toast;

  useEffect(() => {
    if (!toast) {
      visible.value = withTiming(0, { duration: motion.fast });
      return;
    }
    visible.value = withTiming(1, { duration: motion.base, easing: motion.decelerate });
    const timer = setTimeout(() => clearToast(toast.id), 2400);
    return () => clearTimeout(timer);
  }, [toast, clearToast, visible]);

  const style = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateY: (1 - visible.value) * 16 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 76 }, style]}>
      {toast ? (
        <Animated.View style={styles.toast}>
          <Txt weight="semibold" size={14} color="#000000" align="center">
            {toast.message}
          </Txt>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  toast: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    elevation: 6,
  },
});
