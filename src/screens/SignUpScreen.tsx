import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Buttons';
import { Wordmark } from '../components/Logo';
import { Txt } from '../components/Txt';
import type { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/AppState';
import { colors } from '../theme/tokens';
import { Field } from './SignInScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameOk = name.trim().length >= 2;
  const emailOk = EMAIL.test(email.trim());
  const passwordOk = password.length >= 6;
  const valid = nameOk && emailOk && passwordOk;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    setLoading(true);
    setTimeout(() => {
      signIn(name.trim());
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }, 700);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="height">
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Wordmark size={30} />
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Txt weight="black" size={26} lineHeight={32} style={{ marginBottom: 6 }}>
          Create your account
        </Txt>
        <Txt size={14} color={colors.textMuted} style={{ marginBottom: 24 }}>
          Unlimited movies, TV shows & more. Cancel anytime.
        </Txt>
        <Field label="Your name" value={name} onChangeText={setName} />
        {touched && !nameOk ? <Txt size={12} color={colors.redLight} style={styles.error}>Please enter your name.</Txt> : null}
        <Field label="Email" value={email} onChangeText={setEmail} />
        {touched && !emailOk ? <Txt size={12} color={colors.redLight} style={styles.error}>Please enter a valid email address.</Txt> : null}
        <Field label="Password (6+ characters)" value={password} onChangeText={setPassword} secure={secure} onToggleSecure={() => setSecure((s) => !s)} />
        {touched && !passwordOk ? <Txt size={12} color={colors.redLight} style={styles.error}>Password must be at least 6 characters.</Txt> : null}
        <Button label="Sign Up" variant="red" height={50} loading={loading} onPress={submit} style={{ marginTop: 18 }} />
        <Pressable onPress={() => navigation.replace('SignIn')} style={{ marginTop: 26 }}>
          <Txt size={14} color={colors.textDim} align="center">
            Already have an account? <Txt weight="bold" size={14}>Sign in.</Txt>
          </Txt>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  form: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 },
  error: { marginTop: -8, marginBottom: 12 },
});
