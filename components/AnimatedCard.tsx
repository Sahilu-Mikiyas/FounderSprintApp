import { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withDelay, withTiming, withSpring, Easing,
} from 'react-native-reanimated';

interface Props {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}

export function AnimatedCard({ children, delay = 0, style }: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(18);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 22, stiffness: 200 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}
