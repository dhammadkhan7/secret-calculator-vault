/**
 * PinPad
 * Numeric PIN entry component for vault authentication.
 * Supports 4-6 digit PIN with delete and biometric option.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import Colors from "@/constants/colors";

const PIN_LENGTH = 4;

interface PinPadProps {
  pin: string;
  onPinChange: (pin: string) => void;
  onBiometric?: () => void;
  hasBiometric?: boolean;
  shake?: boolean;
}

function PinDots({ pin }: { pin: string }) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < pin.length ? styles.dotFilled : styles.dotEmpty,
          ]}
        />
      ))}
    </View>
  );
}

interface PadButtonProps {
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
  iconName?: keyof typeof Feather.glyphMap;
}

function PadButton({ label, sub, onPress, danger, iconName }: PadButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.padButtonWrapper, animStyle]}>
      <Pressable
        onPressIn={() => {
          scale.value = withTiming(0.88, { duration: 80 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 120 });
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={({ pressed }) => [
          styles.padButton,
          danger && styles.padButtonDanger,
          pressed && styles.padButtonPressed,
        ]}
      >
        {iconName ? (
          <Feather
            name={iconName}
            size={22}
            color={danger ? Colors.vault.danger : Colors.vault.text}
          />
        ) : (
          <View style={styles.padButtonInner}>
            <Text style={styles.padButtonText}>{label}</Text>
            {sub ? <Text style={styles.padButtonSub}>{sub}</Text> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function PinPad({
  pin,
  onPinChange,
  onBiometric,
  hasBiometric = false,
  shake = false,
}: PinPadProps) {
  const translateX = useSharedValue(0);

  React.useEffect(() => {
    if (shake) {
      translateX.value = withRepeat(
        withSequence(
          withTiming(-10, { duration: 60 }),
          withTiming(10, { duration: 60 }),
          withTiming(-8, { duration: 60 }),
          withTiming(8, { duration: 60 }),
          withTiming(0, { duration: 60 })
        ),
        1,
        false
      );
    }
  }, [shake]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function handleDigit(digit: string) {
    if (pin.length < PIN_LENGTH) {
      onPinChange(pin + digit);
    }
  }

  function handleDelete() {
    onPinChange(pin.slice(0, -1));
  }

  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["biometric", "0", "delete"],
  ];

  return (
    <View style={styles.container}>
      <Animated.View style={shakeStyle}>
        <PinDots pin={pin} />
      </Animated.View>

      <View style={styles.pad}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key) => {
              if (key === "biometric") {
                return hasBiometric && onBiometric ? (
                  <PadButton
                    key={key}
                    label=""
                    iconName="activity"
                    onPress={onBiometric}
                  />
                ) : (
                  <View key={key} style={styles.padButtonWrapper} />
                );
              }
              if (key === "delete") {
                return (
                  <PadButton
                    key={key}
                    label=""
                    iconName="delete"
                    onPress={handleDelete}
                    danger
                  />
                );
              }
              return (
                <PadButton
                  key={key}
                  label={key}
                  onPress={() => handleDigit(key)}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%",
  },
  dotsContainer: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 40,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotFilled: {
    backgroundColor: Colors.vault.pinDot,
  },
  dotEmpty: {
    backgroundColor: Colors.vault.pinDotEmpty,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  pad: {
    gap: 12,
    width: "100%",
    maxWidth: 320,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  padButtonWrapper: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 90,
  },
  padButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: Colors.vault.pinButton,
    alignItems: "center",
    justifyContent: "center",
  },
  padButtonDanger: {
    backgroundColor: "transparent",
  },
  padButtonPressed: {
    opacity: 0.6,
  },
  padButtonInner: {
    alignItems: "center",
  },
  padButtonText: {
    fontSize: 28,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.text,
  },
  padButtonSub: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: Colors.vault.textSecondary,
    letterSpacing: 0.5,
    marginTop: -2,
  },
});
