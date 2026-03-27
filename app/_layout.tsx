import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastHost } from "@/components/Toast";
import { AppProvider } from "@/context/AppContext";

SplashScreen.preventAutoHideAsync();

// Suppress known Expo Go limitations that are already handled gracefully in code:
// 1. expo-video keep-awake: blocked on some Android versions — video still plays fine
// 2. expo-media-library: restricted on Android 13+ in Expo Go — we fall back to share sheet
LogBox.ignoreLogs([
  "Unable to activate keep awake",
  "keep awake",
  "ExpoKeepAwake",
  "Due to changes in Androids permission requirements",
  "media library",
  "full access to the media",
]);

// Also catch it as an unhandled rejection so it never reaches Expo Go's red overlay
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
      <Stack.Screen name="vault" options={{ headerShown: false, animation: "slide_from_bottom", presentation: "modal" }} />
      <Stack.Screen name="vault-files" options={{ headerShown: false, animation: "slide_from_right" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // Load Feather icon font from local assets — avoids pnpm symlink resolution issues in Expo Go
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
              <RootLayoutNav />
              {/* Global card-style toast notifications */}
              <ToastHost />
            </AppProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
