import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated';

interface Props {
  pct: number;
  color: string;
  height?: number;
  delay?: number;
  backgroundColor?: string;
}

export function AnimatedProgressBar({ pct, color, height = 4, delay = 300, backgroundColor = '#1a1a1a' }: Props) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(Math.min(pct, 100), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    }));
  }, [pct]);

  const animStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={[styles.track, { height, backgroundColor, borderRadius: height / 2 }]}>
      <Animated.View style={[styles.fill, animStyle, { height, backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: {},
});
