/**
 * CalculatorButton
 * A single calculator button with press animation and haptic feedback.
 * Uses Animated.createAnimatedComponent(Pressable) so the scale transform
 * sits on the same view as the touch handler — fixing Android long-press detection.
 *
 * Rapid-tap safety:
 *  - lastPressRef throttles presses to ≥50 ms apart (prevents queued presses from crashing haptics)
 *  - All Haptics calls are wrapped in try/catch so a native vibration failure never propagates to React
 */

import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

import Colors from "@/constants/colors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = "number" | "operator" | "function";

interface CalculatorButtonProps {
  label: string;
  variant: ButtonVariant;
  onPress: () => void;
  onLongPress?: () => void;
  isWide?: boolean;
  isSelected?: boolean;
  size: number;
}

const MIN_PRESS_INTERVAL = 50; // ms — ignore presses faster than this

export function CalculatorButton({
  label,
  variant,
  onPress,
  onLongPress,
  isWide = false,
  isSelected = false,
  size,
}: CalculatorButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const nativeDriver = Platform.OS !== "web";
  const lastPressRef = useRef(0);

  const buttonWidth = isWide ? size * 2 + 12 : size;
  const buttonHeight = size;

  function getBg() {
    if (variant === "operator") return isSelected ? "#FFFFFF" : Colors.calc.operatorBg;
    if (variant === "function") return Colors.calc.functionBg;
    return Colors.calc.numberBg;
  }

  function getTextColor() {
    if (variant === "operator" && isSelected) return Colors.calc.operatorBg;
    if (variant === "function") return Colors.calc.functionText;
    return Colors.calc.numberText;
  }

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.88,
      useNativeDriver: nativeDriver,
      speed: 50,
      bounciness: 0,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: nativeDriver,
      speed: 30,
      bounciness: 5,
    }).start();
  }

  function safeHapticLight() {
    if (Platform.OS === "web") return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}
  }

  function safeHapticHeavy() {
    if (Platform.OS === "web") return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    } catch {}
  }

  function handlePress() {
    const now = Date.now();
    if (now - lastPressRef.current < MIN_PRESS_INTERVAL) return;
    lastPressRef.current = now;
    safeHapticLight();
    onPress();
  }

  function handleLongPress() {
    safeHapticHeavy();
    onLongPress?.();
  }

  const fontSize = size >= 80 ? 32 : size >= 70 ? 28 : 24;
  const smallFontSize = size >= 80 ? 26 : size >= 70 ? 22 : 18;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={400}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.button,
        {
          backgroundColor: getBg(),
          width: buttonWidth,
          height: buttonHeight,
          borderRadius: buttonHeight / 2,
          alignItems: isWide ? "flex-start" : "center",
          paddingLeft: isWide ? size / 2 - 2 : 0,
          transform: [{ scale }],
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: getTextColor(),
            fontSize: label.length > 1 ? smallFontSize : fontSize,
          },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: "center",
    overflow: "hidden",
  },
  label: {
    fontFamily: "Inter_400Regular",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
