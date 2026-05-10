import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence,
  withTiming, withSpring,
} from 'react-native-reanimated';
import { colors } from '../lib/colors';

interface Props {
  deadline: string;
  accentColor?: string;
}

interface TimeLeft { d: number; h: number; m: number; s: number; }

function calc(deadline: string): TimeLeft {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0 };
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

function AnimatedNum({ value, label }: { value: number; label: string }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      translateY.value = withSequence(
        withTiming(-8, { duration: 100 }),
        withTiming(8, { duration: 0 }),
        withSpring(0, { damping: 18, stiffness: 300 })
      );
      opacity.value = withSequence(
        withTiming(0, { duration: 100 }),
        withTiming(1, { duration: 150 })
      );
      prevRef.current = value;
    }
  }, [value]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.block}>
      <Animated.Text style={[styles.num, animStyle]}>
        {String(value).padStart(2, '0')}
      </Animated.Text>
      <Text style={styles.lbl}>{label}</Text>
    </View>
  );
}

export function CountdownTimer({ deadline, accentColor }: Props) {
  const [time, setTime] = useState<TimeLeft>(calc(deadline));

  useEffect(() => {
    const id = setInterval(() => setTime(calc(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return (
    <View style={styles.row}>
      <AnimatedNum value={time.d} label="Days" />
      <Text style={styles.sep}>:</Text>
      <AnimatedNum value={time.h} label="Hours" />
      <Text style={styles.sep}>:</Text>
      <AnimatedNum value={time.m} label="Min" />
      <Text style={styles.sep}>:</Text>
      <AnimatedNum value={time.s} label="Sec" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  block: {
    flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 12, padding: 10, alignItems: 'center', overflow: 'hidden',
  },
  num: { fontSize: 22, fontWeight: '900', color: colors.white, letterSpacing: -1 },
  lbl: { fontSize: 9, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  sep: { fontSize: 18, fontWeight: '900', color: '#2a2a2a', marginBottom: 12 },
});
