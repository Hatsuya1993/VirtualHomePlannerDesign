import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

// Fades and slides children up into place on mount.
// Stagger lists by passing delay={index * 90}.
export const FadeSlideIn = ({ children, delay = 0, offset = 24, style }) => {
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(progress, {
            toValue: 1,
            duration: 500,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [delay, progress]);

    return (
        <Animated.View
            style={[
                style,
                {
                    opacity: progress,
                    transform: [
                        {
                            translateY: progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [offset, 0],
                            }),
                        },
                    ],
                },
            ]}
        >
            {children}
        </Animated.View>
    );
};
