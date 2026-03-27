/**
 * Vault Screen (vault.tsx)
 * PIN and biometric authentication to enter the hidden vault.
 *
 * Security features:
 *   - PIN entry with 4-digit code
 *   - Biometric (Face ID / fingerprint) if available
 *   - Wrong attempts tracking
 *   - After 3 wrong attempts: fake crash dialog
 *   - First-time: sets a new PIN
 *   - Auto-redirects to vault-files on success
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PinPad } from "@/components/PinPad";
import { useApp } from "@/context/AppContext";
import Colors from "@/constants/colors";
import {
  getBiometricEnabled,
  getWrongAttempts,
  hasPinSet,
  incrementWrongAttempts,
  resetWrongAttempts,
  savePin,
  verifyPin,
} from "@/utils/storage";

type VaultMode = "loading" | "set-pin" | "confirm-pin" | "enter-pin";

export default function VaultScreen() {
  const insets = useSafeAreaInsets();
  const { unlockVault, wrongAttempts, incrementWrong, resetWrong } = useApp();
  const nativeDriver = Platform.OS !== "web";

  const [mode, setMode] = useState<VaultMode>("loading");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [shake, setShake] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [showFakeCrash, setShowFakeCrash] = useState(false);
  const [errorText, setErrorText] = useState("");
  // Keep the first PIN in a ref so it survives the state clear when entering confirm mode
  const firstPinRef = React.useRef("");
  // Prevent auto-biometric from re-firing on every focus within the same session
  const bioFiredRef = useRef(false);

  const iconOpacity = React.useRef(new Animated.Value(0)).current;
  const iconScale = React.useRef(new Animated.Value(0.85)).current;

  // Entrance animation when mode is set
  useEffect(() => {
    if (mode !== "loading") {
      Animated.parallel([
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: nativeDriver,
        }),
        Animated.spring(iconScale, {
          toValue: 1,
          useNativeDriver: nativeDriver,
          speed: 20,
          bounciness: 4,
        }),
      ]).start();
    }
  }, [mode]);

  // Re-initialize every time the screen gains focus so PIN change takes effect immediately
  useFocusEffect(
    useCallback(() => {
      bioFiredRef.current = false; // reset so biometric can auto-fire again on fresh focus
      setPin("");
      setConfirmPin("");
      firstPinRef.current = "";
      setErrorText("");
      setMode("loading");

      async function init() {
        const pinSet = await hasPinSet();
        const bioEnabled = await getBiometricEnabled();
        setBiometricEnabled(bioEnabled);

        if (Platform.OS !== "web") {
          try {
            const biometricAvail = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();
            setHasBiometric(biometricAvail && enrolled);
          } catch {
            setHasBiometric(false);
          }
        }

        setMode(pinSet ? "enter-pin" : "set-pin");
      }
      init();
    }, [])
  );

  // Auto-trigger biometric once per focus session (only if the setting is enabled)
  useEffect(() => {
    if (mode === "enter-pin" && hasBiometric && biometricEnabled && !bioFiredRef.current) {
      bioFiredRef.current = true;
      setTimeout(() => handleBiometric(), 400);
    }
  }, [mode, hasBiometric, biometricEnabled]);

  // Submit when 4 digits entered — watches both pin and confirmPin
  useEffect(() => {
    if (mode === "set-pin" && pin.length === 4) {
      const t = setTimeout(() => {
        // Save first PIN in ref before clearing state
        firstPinRef.current = pin;
        setPin("");
        setConfirmPin("");
        setMode("confirm-pin");
      }, 200);
      return () => clearTimeout(t);
    }
  }, [pin, mode]);

  useEffect(() => {
    if (mode === "confirm-pin" && confirmPin.length === 4) {
      const t = setTimeout(() => handleConfirmPin(), 200);
      return () => clearTimeout(t);
    }
  }, [confirmPin, mode]);

  useEffect(() => {
    if (mode === "enter-pin" && pin.length === 4) {
      const t = setTimeout(() => handleVerifyPin(), 200);
      return () => clearTimeout(t);
    }
  }, [pin, mode]);

  /** Save new PIN (first-time setup) */
  async function handleConfirmPin() {
    // Compare against firstPinRef — pin state was cleared when switching to confirm mode
    if (firstPinRef.current === confirmPin) {
      await savePin(confirmPin);
      await resetWrongAttempts();
      resetWrong();
      setPin("");
      setConfirmPin("");
      firstPinRef.current = "";
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      unlockVault();
      router.replace("/vault-files");
    } else {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      triggerShake();
      setErrorText("PINs don't match. Try again.");
      setPin("");
      setConfirmPin("");
      firstPinRef.current = "";
      setMode("set-pin");
      setTimeout(() => setErrorText(""), 2500);
    }
  }

  /** Verify entered PIN */
  async function handleVerifyPin() {
    const valid = await verifyPin(pin);
    if (valid) {
      await resetWrongAttempts();
      resetWrong();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      unlockVault();
      router.replace("/vault-files");
    } else {
      const newCount = incrementWrong();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      triggerShake();
      setPin("");
      setErrorText("Incorrect PIN");
      setTimeout(() => setErrorText(""), 1500);

      if (newCount >= 3) {
        setTimeout(() => {
          setShowFakeCrash(true);
        }, 300);
      }
    }
  }

  /** Biometric authentication */
  async function handleBiometric() {
    if (Platform.OS === "web") return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Access your secure vault",
        cancelLabel: "Use PIN",
        fallbackLabel: "Use PIN",
      });
      if (result.success) {
        resetWrong();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        unlockVault();
        router.replace("/vault-files");
      }
    } catch {
      // Biometric failed, fall back to PIN
    }
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  function getTitle() {
    switch (mode) {
      case "set-pin":
        return "Create a PIN";
      case "confirm-pin":
        return "Confirm your PIN";
      default:
        return "Enter PIN";
    }
  }

  function getSubtitle() {
    switch (mode) {
      case "set-pin":
        return "Choose a 4-digit PIN to protect your vault";
      case "confirm-pin":
        return "Enter your PIN again to confirm";
      default:
        return "Enter your PIN to access the vault";
    }
  }

  function handleClose() {
    router.back();
  }

  const currentPin = mode === "confirm-pin" ? confirmPin : pin;

  function handlePinChange(value: string) {
    if (mode === "confirm-pin") {
      setConfirmPin(value);
    } else {
      setPin(value);
    }
  }

  if (mode === "loading") return null;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Close button */}
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
          <Feather name="x" size={22} color={Colors.vault.textSecondary} />
        </Pressable>
      </View>

      {/* Lock icon + text */}
      <Animated.View
        style={[
          styles.iconArea,
          { opacity: iconOpacity, transform: [{ scale: iconScale }] },
        ]}
      >
        <View style={styles.lockIcon}>
          <Feather
            name={mode === "enter-pin" ? "lock" : "shield"}
            size={30}
            color={Colors.vault.accent}
          />
        </View>
        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>
        {errorText ? (
          <Text style={styles.errorText}>{errorText}</Text>
        ) : null}
      </Animated.View>

      {/* PIN Pad */}
      <View style={styles.padArea}>
        <PinPad
          pin={currentPin}
          onPinChange={handlePinChange}
          onBiometric={handleBiometric}
          hasBiometric={hasBiometric && mode === "enter-pin"}
          shake={shake}
        />
      </View>

      {/* Fake Crash Modal (wrong PIN 3x) */}
      <Modal
        visible={showFakeCrash}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFakeCrash(false)}
      >
        <View style={styles.crashOverlay}>
          <View style={styles.crashDialog}>
            <View style={styles.crashIcon}>
              <Feather name="alert-triangle" size={28} color="#FF3B30" />
            </View>
            <Text style={styles.crashTitle}>App has stopped</Text>
            <Text style={styles.crashMessage}>
              Calculator has encountered a problem and needs to close. All unsaved data will be lost.
            </Text>
            <Pressable
              onPress={() => {
                setShowFakeCrash(false);
                resetWrong();
                router.back();
              }}
              style={styles.crashButton}
            >
              <Text style={styles.crashButtonText}>Close App</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.vault.background,
  },
  header: {
    paddingHorizontal: 20,
    alignItems: "flex-end",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.vault.surfaceElevated,
    borderRadius: 18,
  },
  iconArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.vault.accentLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.vault.accentGlow,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.vault.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.vault.danger,
    textAlign: "center",
  },
  padArea: {
    paddingHorizontal: 32,
    paddingBottom: 20,
    alignItems: "center",
  },

  // Fake crash dialog
  crashOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  crashDialog: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.3)",
  },
  crashIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,59,48,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  crashTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FF3B30",
    textAlign: "center",
  },
  crashMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 20,
  },
  crashButton: {
    marginTop: 8,
    backgroundColor: "#FF3B30",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },
  crashButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
