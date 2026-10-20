import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Buttons';
import { Wordmark } from '../components/Logo';
import { Txt } from '../components/Txt';
import type { RootStackParamList } from '../navigation/types';
import { authErrorMessage, resetPassword, signInWithEmail } from '../services/firebase';
import { useApp } from '../state/AppState';
import { colors, font, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

export function Field({ label, value, onChangeText, secure, onToggleSecure }: { label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; onToggleSecure?: () => void }) {
  const [focused, setFocused] = useState(false);
  const floating = focused || value.length > 0;
  return (
    <View style={[styles.field, focused ? styles.fieldFocused : null]}>
      <Txt size={floating ? 11 : 15} color={colors.textDim} style={[styles.label, floating ? styles.labelFloating : null]}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={onToggleSecure ? 'default' : 'email-address'}
        selectionColor={colors.text}
        style={styles.input}
      />
      {onToggleSecure ? (
        <Pressable onPress={onToggleSecure} hitSlop={8} style={styles.show}>
          <Txt weight="bold" size={13} color={colors.textMuted}>
            {secure ? 'SHOW' : 'HIDE'}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function SignInScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const valid = email.trim().length >= 3 && password.length >= 6;

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      setError(authErrorMessage(e));
      setLoading(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    try {
      await resetPassword(email);
      showToast('Password reset email sent. Check your inbox.');
    } catch (e) {
      setError(authErrorMessage(e));
    }
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
        {error ? (
          <View style={styles.errorBox}>
            <Txt size={14} color="#000000">{error}</Txt>
          </View>
        ) : null}
        <Field label="Email" value={email} onChangeText={setEmail} />
        <Field label="Password" value={password} onChangeText={setPassword} secure={secure} onToggleSecure={() => setSecure((s) => !s)} />
        <Button label="Sign In" variant={valid ? 'red' : 'outline'} height={50} disabled={!valid} loading={loading} onPress={submit} style={{ marginTop: 18 }} />
        <Pressable onPress={forgot} style={{ marginTop: 24 }}>
          <Txt weight="medium" size={15} align="center">
            Forgot password?
          </Txt>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('SignUp')} style={{ marginTop: 28 }}>
          <Txt size={14} color={colors.textDim} align="center">
            New to MythTube? <Txt weight="bold" size={14}>Sign up now.</Txt>
          </Txt>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  errorBox: { backgroundColor: '#E87C03', borderRadius: 4, padding: 12, marginBottom: 14 },
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  form: { paddingHorizontal: 20, paddingTop: 40 },
  field: {
    height: 58,
    backgroundColor: colors.surface5,
    borderRadius: radius.sm,
    marginBottom: 14,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  fieldFocused: { borderBottomColor: '#E87C03' },
  label: { position: 'absolute', left: 16, top: 19 },
  labelFloating: { top: 8 },
  input: { color: colors.text, fontFamily: font.regular, fontSize: 16, paddingHorizontal: 16, paddingTop: 18, paddingRight: 70 },
  show: { position: 'absolute', right: 16, top: 20 },
});
