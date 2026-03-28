/**
 * SplashAnimation
 * Animated splash screen. Tap anywhere to skip.
 */

import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Colors from "@/constants/colors";

interface SplashAnimationProps {
  onComplete: () => void;
}

export function SplashAnimation({ onComplete }: SplashAnimationProps) {
  const nativeDriver = Platform.OS !== "web";
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.3)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const dismissed = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    if (dismissed.current) return;
    dismissed.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: nativeDriver,
    }).start(() => onComplete());

    // Fallback in case animation callback doesn't fire (web)
    setTimeout(() => onComplete(), 350);
  }

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: nativeDriver,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: nativeDriver,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1,
            duration: 500,
            useNativeDriver: nativeDriver,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.5,
            duration: 500,
            useNativeDriver: nativeDriver,
          }),
        ]),
      ]),
    ]).start();

    // On web preview, skip splash instantly so the calculator is visible
    timerRef.current = setTimeout(dismiss, Platform.OS === "web" ? 0 : 2500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Pressable onPress={dismiss} style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.bg, { opacity: containerOpacity }]}>
        {/* Ring */}
        <Animated.View
          style={[
            styles.ring,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />

        {/* Logo */}
        <Animated.View
          style={[
            styles.logoBox,
            { transform: [{ scale }], opacity: logoOpacity },
          ]}
        >
          <View style={styles.iconBg}>
            <Feather name="grid" size={44} color={Colors.splash.accent} />
          </View>
          <Text style={styles.appName}>Calculator</Text>
        </Animated.View>

        {/* Tap to skip hint */}
        <Text style={styles.tapHint}>Tap to continue</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0F1A",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: "#FF9500",
    backgroundColor: "rgba(255,149,0,0.06)",
  },
  logoBox: {
    alignItems: "center",
    gap: 16,
  },
  iconBg: {
    width: 108,
    height: 108,
    borderRadius: 30,
    backgroundColor: "rgba(255,149,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,149,0,0.25)",
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  tapHint: {
    position: "absolute",
    bottom: 60,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 0.3,
  },
});
