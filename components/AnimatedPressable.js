import { useRef } from "react";
import { Animated, Pressable } from "react-native";

const APressable = Animated.createAnimatedComponent(Pressable);

// Pressable with a springy scale-down on press.
export const AnimatedPressable = ({ children, style, scaleTo = 0.96, ...props }) => {
    const scale = useRef(new Animated.Value(1)).current;

    const springTo = (toValue) =>
        Animated.spring(scale, {
            toValue,
            useNativeDriver: true,
            speed: 40,
            bounciness: 6,
        }).start();

    return (
        <APressable
            onPressIn={() => springTo(scaleTo)}
            onPressOut={() => springTo(1)}
            style={[style, { transform: [{ scale }] }]}
            {...props}
        >
            {children}
        </APressable>
    );
};
