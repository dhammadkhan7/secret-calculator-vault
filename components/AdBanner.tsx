/**
 * AdBanner — native (Android / iOS)
 * Uses react-native-google-mobile-ads BannerAd.
 * The .web.tsx sibling returns null so the web bundler never loads this file.
 *
 * In Expo Go: native module is unavailable → error boundary swallows it silently.
 * In EAS build: real AdMob banner is shown.
 */

import React, { Component, ReactNode } from "react";
import {
  BannerAd,
  BannerAdSize,
} from "react-native-google-mobile-ads";
import { StyleSheet, View } from "react-native";

const ADMOB_BANNER_ID = "ca-app-pub-9346750069338421/2427421270";

// ─── Error boundary — swallows render errors in Expo Go ──────────────────────
interface EBState { hasError: boolean }

class AdErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() {}
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// ─── Public component ─────────────────────────────────────────────────────────

interface AdBannerProps {
  height?: number;
}

export function AdBanner({ height = 50 }: AdBannerProps) {
  return (
    <View style={[styles.wrapper, { height }]}>
      <AdErrorBoundary>
        <BannerAd
          unitId={ADMOB_BANNER_ID}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        />
      </AdErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
