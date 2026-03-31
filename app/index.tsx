/**
 * Calculator Screen
 * iOS-style calculator. Secret vault hidden behind typing "1337" then "=".
 *
 * Layout (row 5): 0 | ⌫ | . | =   (4 equal buttons — no wide 0)
 * Top-left is always AC or C so it's always visible.
 * ⌫ is fixed in the bottom row.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
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
import {
  CalcHistoryRecord,
  addCalcHistoryRecord,
  clearCalcHistory,
  deleteCalcHistoryRecord,
  getCalcHistory,
  getSecretCode,
} from "@/utils/storage";

const { width: RAW_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SCREEN_WIDTH = Math.min(RAW_WIDTH, 430);

// 4 columns, 3 gaps, 16px side padding
const H_PADDING = 16;
const GAP = 10;
const BTN = Math.floor((SCREEN_WIDTH - H_PADDING * 2 - GAP * 3) / 4);

// Ad banner height (standard mobile banner)
const AD_HEIGHT = 50;
const AD_MARGIN = 8;

// ─── Relative time helper ──────────────────────────────────────────────────────

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Group history by day ─────────────────────────────────────────────────────

type HistoryGroup = { label: string; items: CalcHistoryRecord[] };

function groupHistory(records: CalcHistoryRecord[]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  let currentLabel = "";
  let current: CalcHistoryRecord[] = [];

  for (const rec of records) {
    const d = new Date(rec.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let label: string;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    if (label !== currentLabel) {
      if (current.length > 0) groups.push({ label: currentLabel, items: current });
      currentLabel = label;
      current = [];
    }
    current.push(rec);
  }
  if (current.length > 0) groups.push({ label: currentLabel, items: current });
  return groups;
}

// ─── History Panel ─────────────────────────────────────────────────────────────

interface HistoryPanelProps {
  visible: boolean;
  records: CalcHistoryRecord[];
  onClose: () => void;
  onRestore: (result: string, expression: string) => void;
  onDelete: (timestamp: number) => void;
  onClear: () => void;
}

function HistoryPanel({ visible, records, onClose, onRestore, onDelete, onClear }: HistoryPanelProps) {
  const insets = useSafeAreaInsets();
  const groups = groupHistory(records);
  const [confirmingClear, setConfirmingClear] = useState(false);

  function handleClearPress() {
    setConfirmingClear(true);
  }

  function handleCancelClear() {
    setConfirmingClear(false);
  }

  function handleConfirmClear() {
    setConfirmingClear(false);
    onClear();
  }

  type RowItem =
    | { type: "header"; label: string; key: string }
    | { type: "record"; rec: CalcHistoryRecord; key: string };

  const flatItems: RowItem[] = [];
  for (const g of groups) {
    flatItems.push({ type: "header", label: g.label, key: `h_${g.label}` });
    for (const rec of g.items) {
      flatItems.push({ type: "record", rec, key: `r_${rec.timestamp}` });
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={hp.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[hp.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={hp.handle} />

          {/* Header */}
          <View style={hp.header}>
            <Text style={hp.title}>History</Text>
            <View style={hp.headerActions}>
              {records.length > 0 && !confirmingClear && (
                <TouchableOpacity onPress={handleClearPress} style={hp.clearBtn} activeOpacity={0.7}>
                  <Feather name="trash-2" size={16} color="rgba(255,255,255,0.4)" />
                  <Text style={hp.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={hp.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline clear confirmation bar */}
          {confirmingClear && (
            <View style={hp.confirmBar}>
              <Text style={hp.confirmText}>Delete all history?</Text>
              <View style={hp.confirmBtns}>
                <TouchableOpacity onPress={handleCancelClear} style={hp.confirmCancel} activeOpacity={0.7}>
                  <Text style={hp.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmClear} style={hp.confirmDelete} activeOpacity={0.7}>
                  <Feather name="trash-2" size={13} color="#fff" />
                  <Text style={hp.confirmDeleteText}>Delete All</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* List */}
          {records.length === 0 ? (
            <View style={hp.empty}>
              <Feather name="clock" size={36} color="rgba(255,255,255,0.12)" />
              <Text style={hp.emptyText}>No calculations yet</Text>
            </View>
          ) : (
            <FlatList
              data={flatItems}
              keyExtractor={(item) => item.key}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}
              renderItem={({ item }) => {
                if (item.type === "header") {
                  return <Text style={hp.dayLabel}>{item.label}</Text>;
                }
                const { rec } = item;
                return (
                  <TouchableOpacity
                    style={hp.row}
                    activeOpacity={0.7}
                    onPress={() => {
                      onRestore(rec.result, rec.expression);
                      onClose();
                    }}
                    onLongPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      onDelete(rec.timestamp);
                    }}
                  >
                    <View style={hp.rowLeft}>
                      <Text style={hp.expr} numberOfLines={1}>{rec.expression}</Text>
                      <Text style={hp.result}>= {rec.result}</Text>
                    </View>
                    <View style={hp.rowRight}>
                      <Text style={hp.time}>{relativeTime(rec.timestamp)}</Text>
                      <Feather name="corner-down-left" size={13} color="rgba(255,165,0,0.5)" />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const hp = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    minHeight: 260,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  clearText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular",
  },
  closeBtn: {
    padding: 4,
  },
  confirmBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,59,48,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.25)",
  },
  confirmText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
  },
  confirmBtns: {
    flexDirection: "row",
    gap: 8,
  },
  confirmCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  confirmCancelText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
  },
  confirmDelete: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,59,48,0.8)",
  },
  confirmDeleteText: {
    fontSize: 13,
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 48,
  },
  emptyText: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.07)",
  },
  rowLeft: { flex: 1, gap: 2 },
  expr: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
  },
  result: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    letterSpacing: -0.5,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 6,
    marginLeft: 12,
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.25)",
  },
});

// ─── Main calculator screen ───────────────────────────────────────────────────

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const { firstTimeDone, completeTutorial, isLoading } = useApp();

  const [state, setState] = useState<CalculatorState>(createInitialState());
  const [showSplash, setShowSplash] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<CalcHistoryRecord[]>([]);

  const secretBufferRef = useRef("");
  const secretCodeRef = useRef("1337");
  // Track last saved history expression to avoid duplicates on re-render
  const lastSavedExprRef = useRef<string | null>(null);

  // Load secret code and persistent history on mount
  useEffect(() => {
    getSecretCode().then((code) => { secretCodeRef.current = code; });
    getCalcHistory().then(setHistoryRecords);
  }, []);

  // Sync new in-memory calculation to AsyncStorage whenever state.history changes
  useEffect(() => {
    const latest = state.history[0];
    if (!latest) return;
    // Avoid duplicate saves (same expression)
    if (lastSavedExprRef.current === latest.expression) return;
    lastSavedExprRef.current = latest.expression;

    const record: CalcHistoryRecord = {
      expression: latest.expression,
      result: latest.result,
      timestamp: Date.now(),
    };
    addCalcHistoryRecord(record).then(() =>
      getCalcHistory().then(setHistoryRecords)
    );
  }, [state.history]);

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

  function pressClear() {
    secretBufferRef.current = "";
    setActiveOp(null);
    setState((prev) => clearAll(prev));
  }

  function pressSign() {
    setState((prev) => toggleSign(prev));
  }

  function pressPercent() {
    setState((prev) => inputPercent(prev));
  }

  // ─── HISTORY HANDLERS ─────────────────────────────────────

  const handleRestoreHistory = useCallback((result: string, expression: string) => {
    // Put the result on the display as a fresh starting number
    setState({
      ...createInitialState(),
      display: result,
      expression: `(${expression})`,
      waitingForOperand: true,
      history: state.history,
    });
    setActiveOp(null);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [state.history]);

  const handleDeleteHistoryItem = useCallback((timestamp: number) => {
    deleteCalcHistoryRecord(timestamp).then(() =>
      getCalcHistory().then(setHistoryRecords)
    );
  }, []);

  const handleClearHistory = useCallback(() => {
    clearCalcHistory().then(() => {
      setHistoryRecords([]);
      setState((prev) => ({ ...prev, history: [] }));
      lastSavedExprRef.current = null;
    });
  }, []);

  // ─── DISPLAY ──────────────────────────────────────────────

  const clearLabel = "AC";

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

  const bottomPad = Math.max(insets.bottom, 20) + 28;
  const gridHeight = (BTN + GAP) * 5 - GAP;
  const adAreaHeight = AD_HEIGHT + AD_MARGIN * 2;
  const displayAreaHeight =
    SCREEN_HEIGHT - insets.top - gridHeight - bottomPad - adAreaHeight - 16;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Display ── */}
      <View style={[styles.displayArea, { minHeight: Math.max(displayAreaHeight, 160) }]}>

        {/* History icon button */}
        <TouchableOpacity
          style={styles.historyIconBtn}
          onPress={() => setShowHistory(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="clock" size={18} color={
            historyRecords.length > 0
              ? "rgba(255,165,0,0.7)"
              : "rgba(255,255,255,0.2)"
          } />
          {historyRecords.length > 0 && (
            <View style={styles.historyBadge}>
              <Text style={styles.historyBadgeText}>
                {historyRecords.length > 99 ? "99+" : historyRecords.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Recent history preview (last 2 items) */}
        <View style={styles.historyArea}>
          {state.history.slice(0, 2).map((rec, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => handleRestoreHistory(rec.result, rec.expression)}
              activeOpacity={0.6}
            >
              <Text style={styles.historyRow} numberOfLines={1}>
                {rec.expression} = {rec.result}
              </Text>
            </TouchableOpacity>
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

      {/* ── History Panel ── */}
      <HistoryPanel
        visible={showHistory}
        records={historyRecords}
        onClose={() => setShowHistory(false)}
        onRestore={handleRestoreHistory}
        onDelete={handleDeleteHistoryItem}
        onClear={handleClearHistory}
      />

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
  historyIconBtn: {
    position: "absolute",
    top: 12,
    left: H_PADDING + 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 10,
  },
  historyBadge: {
    backgroundColor: "rgba(255,165,0,0.85)",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  historyBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#000",
  },
  historyArea: {
    alignItems: "flex-end",
    marginBottom: 4,
    minHeight: 44,
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
    fontSize: 26,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.68)",
    textAlign: "right",
    marginBottom: 4,
    letterSpacing: 0.5,
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
