import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../lib/colors';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Background glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Image
            source={require('../../assets/images/logo.jpg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>
          Founder<Text style={styles.titleAccent}>Sprint</Text>
        </Text>
        <Text style={styles.subtitle}>
          Build your business one focused day at a time
        </Text>

        {/* CTAs */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => router.push('/(auth)/sign-up')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnGhost}
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.7}
          >
            <Text style={styles.btnGhostText}>Already have an account? <Text style={{ color: colors.grey400 }}>Sign in</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: width / 2 - 200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: 0,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(59,130,246,0.05)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: {
    marginBottom: 28,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 24,
  },
  title: {
    fontSize: 38,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  titleAccent: {
    color: colors.revenue,
  },
  subtitle: {
    fontSize: 15,
    color: colors.grey600,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 260,
    marginTop: 10,
  },
  ctas: {
    width: '100%',
    marginTop: 52,
    gap: 12,
  },
  btnPrimary: {
    width: '100%',
    height: 54,
    backgroundColor: colors.white,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.black,
    letterSpacing: -0.3,
  },
  btnGhost: {
    width: '100%',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: {
    fontSize: 14,
    color: colors.grey600,
  },
});
