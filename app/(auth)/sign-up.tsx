import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';

export default function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !name) {
      Alert.alert('Fill in all fields');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      Alert.alert('Check your email', 'We sent you a confirmation link.', [
        { text: 'OK', onPress: () => router.push('/(auth)/sign-in') },
      ]);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Start your sprint</Text>
          <Text style={styles.subtitle}>Create your account — it takes 30 seconds</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Mikiyas"
              placeholderTextColor={colors.grey800}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.grey800}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Min. 8 characters"
              placeholderTextColor={colors.grey800}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')}>
            <Text style={styles.switchText}>
              Already have an account? <Text style={{ color: colors.white }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  inner: { flex: 1, paddingHorizontal: 24 },
  back: { marginTop: 8, marginBottom: 32 },
  backText: { color: colors.grey600, fontSize: 14, fontWeight: '600' },
  header: { marginBottom: 36 },
  title: { fontSize: 30, fontWeight: '900', color: colors.white, letterSpacing: -1 },
  subtitle: { fontSize: 14, color: colors.grey600, marginTop: 6 },
  form: { gap: 16 },
  field: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', color: colors.grey600, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    height: 52, backgroundColor: colors.grey900, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 15, color: colors.white,
    borderWidth: 1, borderColor: colors.grey800,
  },
  btnPrimary: {
    height: 54, backgroundColor: colors.white, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: colors.black },
  switchText: { textAlign: 'center', color: colors.grey600, fontSize: 14, marginTop: 4 },
});
