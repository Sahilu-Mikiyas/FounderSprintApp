import { useEffect, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated';

interface Props {
  pct: number;
  color: string;
  height?: number;
  delay?: number;
  backgroundColor?: string;
}

export function AnimatedProgressBar({ pct, color, height = 4, delay = 300, backgroundColor = '#1a1a1a' }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const widthAnim = useSharedValue(0);

  useEffect(() => {
    if (containerWidth === 0) return;
    const target = (Math.min(pct, 100) / 100) * containerWidth;
    widthAnim.value = withDelay(delay, withTiming(target, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    }));
  }, [pct, containerWidth]);

  const animStyle = useAnimatedStyle(() => ({
    width: widthAnim.value,
  }));

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }

  return (
    <View
      onLayout={onLayout}
      style={{ height, backgroundColor, borderRadius: height / 2, overflow: 'hidden', marginBottom: 10 }}
    >
      <Animated.View style={[{
        height,
        backgroundColor: color,
        borderRadius: height / 2,
      }, animStyle]} />
    </View>
  );
}
