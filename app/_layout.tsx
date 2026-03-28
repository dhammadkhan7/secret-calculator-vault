import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter, useSegments, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
  Image,
  LogBox,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastHost } from "@/components/Toast";
import { AppProvider } from "@/context/AppContext";

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  "Unable to activate keep awake",
  "keep awake",
  "ExpoKeepAwake",
  "Due to changes in Androids permission requirements",
  "media library",
  "full access to the media",
]);

if (typeof ErrorUtils !== "undefined") {
  const _prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    if (error?.message?.toLowerCase().includes("keep awake")) return;
    _prev(error, isFatal);
  });
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="vault"
        options={{
          headerShown: false,
          animation: "slide_from_bottom",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="vault-files"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
    </Stack>
  );
}

function PrivacyGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [showPrivacy, setShowPrivacy] = useState(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const segmentsRef = useRef(segments);
  const wasOnVaultRef = useRef(false);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        const prev = appStateRef.current;
        appStateRef.current = nextState;

        if (nextState === "background" || nextState === "inactive") {
          const onVault = segmentsRef.current.some(
            (s) => s === "vault" || s === "vault-files"
          );
          wasOnVaultRef.current = onVault;
          setShowPrivacy(true);
        } else if (nextState === "active" && prev !== "active") {
          if (wasOnVaultRef.current) {
            wasOnVaultRef.current = false;
            try {
              router.dismissAll();
            } catch {
              router.replace("/");
            }
          }
          setTimeout(() => setShowPrivacy(false), 350);
        }
      }
    );

    return () => sub.remove();
  }, [router]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {showPrivacy && (
        <View style={privacyStyles.overlay} pointerEvents="none">
          <Image
            source={require("../assets/images/icon.png")}
            style={privacyStyles.icon}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
}

const privacyStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0F1A",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  icon: {
    width: 90,
    height: 90,
    borderRadius: Platform.OS === "ios" ? 20 : 18,
    opacity: 0.9,
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Feather: require("../assets/fonts/Feather.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AppProvider>
              <PrivacyGuard>
                <RootLayoutNav />
                <ToastHost />
              </PrivacyGuard>
            </AppProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
