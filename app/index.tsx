import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/colors';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const { session, loading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  // Animation values
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;

  // Check auth + onboarding
  useEffect(() => {
    if (loading) return;
    if (!session) { setChecking(false); return; }
    supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setOnboarded(data?.onboarding_complete ?? false);
        setChecking(false);
      });
  }, [session, loading]);

  // Run entrance animation then redirect after 5s
  useEffect(() => {
    // Logo fades + scales in
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();

    // Text slides in after 500ms
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(textY, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
    }, 500);

    // Tagline fades in after 1s
    setTimeout(() => {
      Animated.timing(taglineOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, 1000);

    // Loading dots fade in after 1.5s
    setTimeout(() => {
      Animated.timing(dotsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 1500);
  }, []);

  // Navigate after 5 seconds once we know auth state
  useEffect(() => {
    if (checking) return;
    const timer = setTimeout(() => {
      if (!session) {
        router.replace('/(auth)/welcome');
      } else if (!onboarded) {
        router.replace('/onboarding/mode');
      } else {
        router.replace('/(tabs)/today');
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [checking, session, onboarded]);

  const isLoggedIn = !!session;

  return (
    <View style={styles.container}>
      {/* Background glows */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.content}>
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Image
            source={require('../assets/images/logo.jpg')}
            style={styles.logo}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Welcome text */}
        <Animated.Text style={[styles.welcome, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>
          {isLoggedIn ? 'Welcome back,' : 'Welcome to,'}
        </Animated.Text>
        <Animated.Text style={[styles.brand, { opacity: textOpacity, transform: [{ translateY: textY }] }]}>
          Founder<Text style={styles.brandAccent}>Sprint</Text>
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          {isLoggedIn
            ? 'Ready to make today count? 🚀'
            : 'Build your business one focused day at a time'}
        </Animated.Text>

        {/* Loading dots */}
        <Animated.View style={[styles.dotsRow, { opacity: dotsOpacity }]}>
          <LoadingDots />
        </Animated.View>
      </View>
    </View>
  );
}

function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          Animated.delay(800 - delay),
        ])
      ).start();

    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, []);

  return (
    <View style={styles.dots}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  glowTop: {
    position: 'absolute', top: -80, left: width / 2 - 180,
    width: 360, height: 360, borderRadius: 180,
    backgroundColor: 'rgba(34,197,94,0.07)',
  },
  glowBottom: {
    position: 'absolute', bottom: 60, right: -60,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(99,102,241,0.05)',
  },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  logoWrap: {
    width: 120, height: 120, borderRadius: 28,
    overflow: 'hidden', marginBottom: 32,
    shadowColor: colors.revenue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 12,
  },
  logo: { width: '100%', height: '100%' },
  welcome: {
    fontSize: 18, fontWeight: '500', color: colors.grey600,
    letterSpacing: 0.2, marginBottom: 4,
  },
  brand: {
    fontSize: 42, fontWeight: '900', color: colors.white,
    letterSpacing: -2, marginBottom: 16,
  },
  brandAccent: { color: colors.revenue },
  tagline: {
    fontSize: 14, color: colors.grey600,
    textAlign: 'center', lineHeight: 22, maxWidth: 240,
  },
  dotsRow: { marginTop: 60 },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.revenue,
  },
});
