/**
 * TutorialOverlay
 * 3-step first-time tutorial explaining calculator + vault unlock.
 * Uses React Native Animated (not Reanimated) for cross-platform compat.
 */

import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Colors from "@/constants/colors";

const { width } = Dimensions.get("window");

interface TutorialStep {
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

const STEPS: TutorialStep[] = [
  {
    title: "Standard Calculator",
    description:
      "This is a fully functional calculator. Use it normally for all arithmetic — nobody will know it's more than a calculator.",
    icon: "hash",
  },
  {
    title: "Open the Secret Vault",
    description:
      'Type "1337" on the calculator then press "=" to open your hidden vault. Or long-press the "=" button for instant access.',
    icon: "lock",
  },
  {
    title: "Secure File Storage",
    description:
      "Store photos and videos inside your vault. Files are hidden in private encrypted storage — invisible to your gallery or file explorer.",
    icon: "shield",
  },
];

interface TutorialOverlayProps {
  onSkip: () => void;
  onComplete: () => void;
}

export function TutorialOverlay({ onSkip, onComplete }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);
  const nativeDriver = Platform.OS !== "web";

  const arrowAnim = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Entrance animation
  useEffect(() => {
    Animated.timing(cardOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: nativeDriver,
    }).start();
  }, []);

  // Arrow bounce loop
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: -6,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: nativeDriver,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [step]);

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  }

  return (
    <View style={styles.overlay}>
      {/* Dim backdrop */}
      <Pressable style={styles.backdrop} onPress={onSkip} />

      {/* Card */}
      <Animated.View style={[styles.card, { opacity: cardOpacity }]}>
        {/* Step dots */}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step
                  ? styles.dotActive
                  : i < step
                  ? styles.dotDone
                  : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Icon */}
        <View style={styles.iconRing}>
          <Feather name={currentStep.icon} size={26} color="#FF9500" />
        </View>

        {/* Text */}
        <Text style={styles.title}>{currentStep.title}</Text>
        <Text style={styles.desc}>{currentStep.description}</Text>

        {/* Arrow */}
        <Animated.View
          style={{ transform: [{ translateY: arrowAnim }], marginBottom: 4 }}
        >
          <Feather name="chevrons-down" size={22} color="rgba(255,149,0,0.6)" />
        </Animated.View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          <Pressable onPress={onSkip} style={styles.skipBtn} hitSlop={8}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>

          <Pressable onPress={handleNext} style={styles.nextBtn}>
            <Text style={styles.nextText}>{isLast ? "Start Using" : "Next"}</Text>
            <Feather
              name={isLast ? "check" : "arrow-right"}
              size={15}
              color="#000"
            />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: "flex-end",
    paddingBottom: 32,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: "#1C1C1E",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: "#FF9500",
  },
  dotDone: {
    width: 6,
    backgroundColor: "rgba(255,149,0,0.5)",
  },
  dotInactive: {
    width: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(255,149,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,149,0,0.2)",
    marginTop: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  desc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 21,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 4,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flex: 1,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  skipText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.4)",
  },
  nextBtn: {
    flex: 2.5,
    backgroundColor: "#FF9500",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  nextText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#000000",
  },
});
