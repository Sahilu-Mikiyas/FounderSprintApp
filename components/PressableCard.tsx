import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  scaleDown?: number;
}

export function PressableCard({ children, onPress, style, scaleDown = 0.97 }: Props) {
  const scale = useSharedValue(1);

  const tap = Gesture.Tap()
    .onBegin(() => { scale.value = withSpring(scaleDown, { damping: 20, stiffness: 350 }); })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 18, stiffness: 300 });
      if (onPress) onPress();
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[animStyle, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
