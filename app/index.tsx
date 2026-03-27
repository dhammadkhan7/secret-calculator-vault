/**
 * Calculator Screen
 * iOS-style calculator. Secret vault hidden behind typing "1337" then "=".
 *
 * Layout (row 5): 0 | ⌫ | . | =   (4 equal buttons — no wide 0)
 * Top-left is always AC or C so it's always visible.
 * ⌫ is fixed in the bottom row.
 */

import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdBanner } from "@/components/AdBanner";
import { CalculatorButton } from "@/components/CalculatorButton";
import { SplashAnimation } from "@/components/SplashAnimation";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { useApp } from "@/context/AppContext";
import Colors from "@/constants/colors";
import {
  backspace,
  clearAll,
  clearDisplay,
  createInitialState,
  inputDigit,
  inputEquals,
  inputOperator,
  inputPercent,
  toggleSign,
  type CalculatorState,
} from "@/utils/calculator";
import { getSecretCode } from "@/utils/storage";

const { width: RAW_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SCREEN_WIDTH = Math.min(RAW_WIDTH, 430);

// 4 columns, 3 gaps, 16px side padding
const H_PADDING = 16;
const GAP = 10;
const BTN = Math.floor((SCREEN_WIDTH - H_PADDING * 2 - GAP * 3) / 4);

// Ad banner height (standard mobile banner)
const AD_HEIGHT = 50;
const AD_MARGIN = 8;

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const { firstTimeDone, completeTutorial, isLoading } = useApp();

  const [state, setState] = useState<CalculatorState>(createInitialState());
  const [showSplash, setShowSplash] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const secretBufferRef = useRef("");
  // Secret code loaded from storage (default "1337", updated when user changes it)
  const secretCodeRef = useRef("1337");

  useEffect(() => {
    getSecretCode().then((code) => {
      secretCodeRef.current = code;
    });
  }, []);

  function handleSplashComplete() {
    setShowSplash(false);
    if (!firstTimeDone && !isLoading) setShowTutorial(true);
  }

  useEffect(() => {
    if (!isLoading && !showSplash && !firstTimeDone) setShowTutorial(true);
  }, [isLoading, firstTimeDone, showSplash]);

  function handleTutorialDone() {
    setShowTutorial(false);
    completeTutorial();
  }

  function openVault() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    secretBufferRef.current = "";
    setState(createInitialState());
    setActiveOp(null);
    router.push("/vault");
  }

  // ─── CALCULATOR HANDLERS ───────────────────────────────────

  function pressDigit(digit: string) {
    secretBufferRef.current = (secretBufferRef.current + digit).slice(-8);
    setState((prev) => inputDigit(prev, digit));
  }

  function pressOperator(op: string) {
    secretBufferRef.current = "";
    setActiveOp(op);
    setState((prev) => inputOperator(prev, op as any));
  }

  function pressEquals() {
    const bufferBeforeEquals = secretBufferRef.current;
    secretBufferRef.current = "";
    setState((prev) => inputEquals(prev));
    setActiveOp(null);
    // Reload secret code each time so we always use the latest saved value
    getSecretCode().then((code) => {
      secretCodeRef.current = code;
      if (bufferBeforeEquals.endsWith(code)) {
        setTimeout(() => openVault(), 120);
      }
    });
  }

  function pressBackspace() {
    if (secretBufferRef.current.length > 0) {
      secretBufferRef.current = secretBufferRef.current.slice(0, -1);
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState((prev) => backspace(prev));
  }

  /**
   * AC / C logic:
   *   AC — completely fresh (no operator, no previous, display is "0")
   *   C  — clear current number only; keep the operator chain so user can retype
   */
  function pressClear() {
    const isAC = !state.previousValue && !state.operator && state.display === "0";
    secretBufferRef.current = "";
    if (isAC) {
      setActiveOp(null);
      setState((prev) => clearAll(prev));
    } else {
      setState((prev) => clearDisplay(prev));
    }
  }

  function pressSign() {
    setState((prev) => toggleSign(prev));
  }

  function pressPercent() {
    setState((prev) => inputPercent(prev));
  }

  // ─── DISPLAY ──────────────────────────────────────────────

  // AC shows when calculator is completely blank, C otherwise
  const clearLabel =
    !state.previousValue && !state.operator && state.display === "0" ? "AC" : "C";

  const rawDisplay = state.display;
  const displayLen = rawDisplay.length;
  const displayFontSize =
    displayLen > 14 ? 30
    : displayLen > 12 ? 36
    : displayLen > 9  ? 48
    : displayLen > 6  ? 62
    : 80;

  function formatDisplay(val: string): string {
    if (val === "Error") return "Error";
    const negative = val.startsWith("-");
    const clean = val.replace(/,/g, "").replace("-", "");
    if (!clean.includes(".")) {
      const num = parseInt(clean, 10);
      if (!isNaN(num) && Math.abs(num) < 1e15) {
        return (negative ? "-" : "") + num.toLocaleString("en-US");
      }
    }
    return val;
  }

  const bottomPad = Math.max(insets.bottom, 20);
  const gridHeight = (BTN + GAP) * 5 - GAP;
  const adAreaHeight = AD_HEIGHT + AD_MARGIN * 2;
  const displayAreaHeight =
    SCREEN_HEIGHT - insets.top - gridHeight - bottomPad - adAreaHeight - 16;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Display ── */}
      <View style={[styles.displayArea, { minHeight: Math.max(displayAreaHeight, 160) }]}>
        {/* History */}
        <View style={styles.historyArea}>
          {state.history.slice(0, 3).map((rec, i) => (
            <Text key={i} style={styles.historyRow} numberOfLines={1}>
              {rec.expression} = {rec.result}
            </Text>
          ))}
        </View>

        {/* In-progress expression */}
        {state.expression ? (
          <Text style={styles.expression} numberOfLines={1} adjustsFontSizeToFit>
            {state.expression}
          </Text>
        ) : null}

        {/* Main number */}
        <Text
          style={[styles.displayNumber, { fontSize: displayFontSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.35}
        >
          {formatDisplay(rawDisplay)}
        </Text>
      </View>

      {/* ── Ad Banner (AdMob) ── */}
      <View style={styles.adBanner}>
        <AdBanner height={AD_HEIGHT} />
      </View>

      {/* ── Button Grid ── */}
      <View style={[styles.grid, { paddingBottom: bottomPad, paddingHorizontal: H_PADDING }]}>

        {/* Row 1: AC/C  +/-  %  ÷ */}
        <View style={styles.row}>
          <CalculatorButton label={clearLabel} variant="function" onPress={pressClear} size={BTN} />
          <CalculatorButton label="+/-" variant="function" onPress={pressSign} size={BTN} />
          <CalculatorButton label="%" variant="function" onPress={pressPercent} size={BTN} />
          <CalculatorButton
            label="÷"
            variant="operator"
            isSelected={activeOp === "÷"}
            onPress={() => pressOperator("÷")}
            size={BTN}
          />
        </View>

        {/* Row 2: 7  8  9  × */}
        <View style={styles.row}>
          <CalculatorButton label="7" variant="number" onPress={() => pressDigit("7")} size={BTN} />
          <CalculatorButton label="8" variant="number" onPress={() => pressDigit("8")} size={BTN} />
          <CalculatorButton label="9" variant="number" onPress={() => pressDigit("9")} size={BTN} />
          <CalculatorButton
            label="×"
            variant="operator"
            isSelected={activeOp === "×"}
            onPress={() => pressOperator("×")}
            size={BTN}
          />
        </View>

        {/* Row 3: 4  5  6  − */}
        <View style={styles.row}>
          <CalculatorButton label="4" variant="number" onPress={() => pressDigit("4")} size={BTN} />
          <CalculatorButton label="5" variant="number" onPress={() => pressDigit("5")} size={BTN} />
          <CalculatorButton label="6" variant="number" onPress={() => pressDigit("6")} size={BTN} />
          <CalculatorButton
            label="−"
            variant="operator"
            isSelected={activeOp === "-"}
            onPress={() => pressOperator("-")}
            size={BTN}
          />
        </View>

        {/* Row 4: 1  2  3  + */}
        <View style={styles.row}>
          <CalculatorButton label="1" variant="number" onPress={() => pressDigit("1")} size={BTN} />
          <CalculatorButton label="2" variant="number" onPress={() => pressDigit("2")} size={BTN} />
          <CalculatorButton label="3" variant="number" onPress={() => pressDigit("3")} size={BTN} />
          <CalculatorButton
            label="+"
            variant="operator"
            isSelected={activeOp === "+"}
            onPress={() => pressOperator("+")}
            size={BTN}
          />
        </View>

        {/* Row 5: 0  ⌫  .  = */}
        <View style={styles.row}>
          <CalculatorButton label="0" variant="number" onPress={() => pressDigit("0")} size={BTN} />
          <CalculatorButton
            label="⌫"
            variant="function"
            onPress={pressBackspace}
            onLongPress={pressClear}
            size={BTN}
          />
          <CalculatorButton label="." variant="number" onPress={() => pressDigit(".")} size={BTN} />
          <CalculatorButton
            label="="
            variant="operator"
            onPress={pressEquals}
            onLongPress={openVault}
            size={BTN}
          />
        </View>
      </View>

      {showSplash && <SplashAnimation onComplete={handleSplashComplete} />}
      {showTutorial && !showSplash && (
        <TutorialOverlay onSkip={handleTutorialDone} onComplete={handleTutorialDone} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "flex-end",
    maxWidth: 430,
    width: "100%",
    alignSelf: "center",
  },
  displayArea: {
    justifyContent: "flex-end",
    paddingHorizontal: H_PADDING + 4,
    paddingBottom: 6,
  },
  historyArea: {
    alignItems: "flex-end",
    marginBottom: 4,
    minHeight: 48,
    justifyContent: "flex-end",
  },
  historyRow: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.25)",
    marginBottom: 1,
    textAlign: "right",
  },
  expression: {
    fontSize: 18,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
    textAlign: "right",
    marginBottom: 2,
  },
  displayNumber: {
    fontFamily: "Inter_400Regular",
    color: "#FFFFFF",
    textAlign: "right",
    includeFontPadding: false,
  },
  // ── Ad Banner ──────────────────────────────────────────────
  adBanner: {
    marginHorizontal: H_PADDING,
    marginVertical: AD_MARGIN,
    height: AD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // ── Grid ───────────────────────────────────────────────────
  grid: {
    gap: GAP,
  },
  row: {
    flexDirection: "row",
    gap: GAP,
    alignItems: "center",
  },
});
