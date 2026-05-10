import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';

// Fade + slide up on mount
export function useFadeSlideIn(delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  const start = () => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 20, stiffness: 180 }));
  };

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return { start, animatedStyle };
}

// Scale press feedback
export function usePressScale(scale = 0.96) {
  const sv = useSharedValue(1);

  const onPressIn = () => { sv.value = withSpring(scale, { damping: 20, stiffness: 300 }); };
  const onPressOut = () => { sv.value = withSpring(1, { damping: 20, stiffness: 300 }); };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sv.value }],
  }));

  return { onPressIn, onPressOut, animatedStyle };
}

// Animated progress bar width
export function useProgressBar(targetPct: number, delay = 200) {
  const width = useSharedValue(0);

  const animate = () => {
    width.value = withDelay(delay, withTiming(targetPct, { duration: 800, easing: Easing.out(Easing.cubic) }));
  };

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as any,
  }));

  return { animate, animatedStyle };
}

// Bounce on check
export function useCheckBounce() {
  const scale = useSharedValue(1);

  const bounce = () => {
    scale.value = withSequence(
      withSpring(1.3, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 15, stiffness: 300 })
    );
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return { bounce, animatedStyle };
}

// Countdown number flip
export function useNumberFlip() {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const flip = (cb: () => void) => {
    translateY.value = withTiming(-12, { duration: 120 });
    opacity.value = withTiming(0, { duration: 120 }, () => {
      runOnJS(cb)();
      translateY.value = 12;
      translateY.value = withSpring(0, { damping: 18, stiffness: 280 });
      opacity.value = withTiming(1, { duration: 150 });
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return { flip, animatedStyle };
}

// Stagger children fade in
export function useStaggerDelay(index: number, baseDelay = 60) {
  return index * baseDelay;
}
