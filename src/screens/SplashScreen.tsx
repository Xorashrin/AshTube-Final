import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ALogo } from '../components/Logo';
import { Txt } from '../components/Txt';
import type { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors, motion } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const { state } = useApp();
  const { width, height } = useWindowDimensions();

  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(12)).current;
  const glowScale = useRef(new Animated.Value(0.8)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  // Cinematic intro animations
  useEffect(() => {
    Animated.parallel([
      // Glow pulse
      Animated.timing(glowOpacity, {
        toValue: 0.38,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(glowScale, {
        toValue: 1.25,
        duration: 800,
        easing: motion.decelerate,
        useNativeDriver: true,
      }),
      // Logo entrance
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      // Text entrance
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(textTranslateY, {
            toValue: 0,
            duration: 350,
            easing: motion.decelerate,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [glowOpacity, glowScale, logoOpacity, logoScale, textOpacity, textTranslateY]);

  // Non-blocking navigation: wait for essential auth/hydration readiness, then transition cleanly
  useEffect(() => {
    if (!state.hydrated || !state.authReady) return;

    // Minimum display interval (650ms) ensures smooth visual branding without artificial stall
    const timer = setTimeout(() => {
      Animated.timing(exitOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true,
      }).start(() => {
        navigation.replace(state.signedIn ? 'Main' : 'Landing');
      });
    }, 650);

    return () => clearTimeout(timer);
  }, [state.hydrated, state.authReady, state.signedIn, navigation, exitOpacity]);

  const isLandscape = width > height;
  const logoSize = isLandscape ? 84 : 110;

  return (
    <View style={styles.root}>
      {/* Cinematic dark backdrop with deep crimson ambient vignette */}
      <LinearGradient
        colors={['#000000', '#0a0305', '#140306', '#050102', '#000000']}
        locations={[0, 0.3, 0.5, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.container, { opacity: exitOpacity }]}>
        {/* Ambient backlight glow */}
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        {/* AshTube Brand Mark */}
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
            alignItems: 'center',
          }}
        >
          <ALogo size={logoSize} />
        </Animated.View>

        {/* AshTube Typography and Tagline */}
        <Animated.View
          style={[
            styles.brandTextWrap,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Txt weight="display" size={isLandscape ? 34 : 42} color={colors.red} spacing={3} lineHeight={isLandscape ? 38 : 46}>
            ASHTUBE
          </Txt>
          <Txt weight="medium" size={11} color={colors.textMuted} spacing={2} style={styles.tagline}>
            UNLIMITED STREAMING & DISCOVERY
          </Txt>
        </Animated.View>

        {/* Subtle loading indicator only if async hydration is still pending */}
        {(!state.hydrated || !state.authReady) && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.red} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.red,
    filter: 'blur(30px)',
  },
  brandTextWrap: {
    alignItems: 'center',
    marginTop: 20,
  },
  tagline: {
    marginTop: 6,
    opacity: 0.85,
    textAlign: 'center',
  },
  loadingWrap: {
    position: 'absolute',
    bottom: -60,
  },
});
