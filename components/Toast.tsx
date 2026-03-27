/**
 * Toast — modern card-style notification system.
 *
 * Usage (imperative, works from anywhere):
 *   import { toast } from "@/components/Toast";
 *   toast.success("Saved!", "Your file has been saved to the gallery.");
 *   toast.error("Failed", "Could not save the file.");
 *   toast.info("Tip", "Long-press a file to select it for deletion.");
 *
 * Mount <ToastHost /> once in _layout.tsx — it renders on top of everything.
 */

import { Feather } from "@expo/vector-icons";
import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Animated, Dimensions, Platform, StyleSheet, Text, View } from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");

type ToastType = "success" | "error" | "info";

interface ToastMessage {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastRef {
  show: (type: ToastType, title: string, message?: string) => void;
}

const COLORS: Record<ToastType, { bg: string; icon: string; border: string; iconName: keyof typeof Feather.glyphMap }> = {
  success: { bg: "#1A2A1A", icon: "#34C759", border: "#34C75930", iconName: "check-circle" },
  error:   { bg: "#2A1A1A", icon: "#FF453A", border: "#FF453A30", iconName: "alert-circle" },
  info:    { bg: "#1A1A2E", icon: "#7B61FF", border: "#7B61FF30", iconName: "info" },
};

// Single visible toast card
function ToastCard({ item, onDone }: { item: ToastMessage; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const c = COLORS[item.type];

  useEffect(() => {
    // Slide in
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }).start();
    // Auto-dismiss after 3s
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(onDone);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [120, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] });

  return (
    <Animated.View style={[styles.card, { backgroundColor: c.bg, borderColor: c.border, opacity, transform: [{ translateY }] }]}>
      <View style={[styles.iconBg, { backgroundColor: c.icon + "22" }]}>
        <Feather name={c.iconName} size={20} color={c.icon} />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: c.icon }]}>{item.title}</Text>
        {!!item.message && <Text style={styles.msg} numberOfLines={2}>{item.message}</Text>}
      </View>
    </Animated.View>
  );
}

// Host component — mount once in layout
const hostRef = React.createRef<ToastRef>();

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  useImperativeHandle(hostRef, () => ({
    show(type, title, message) {
      const id = ++counter.current;
      setToasts((prev) => [...prev.slice(-1), { id, type, title, message }]);
    },
  }));

  function remove(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <View style={styles.host} pointerEvents="none">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDone={() => remove(item.id)} />
      ))}
    </View>
  );
}

// Imperative API
export const toast = {
  success: (title: string, message?: string) => hostRef.current?.show("success", title, message),
  error: (title: string, message?: string) => hostRef.current?.show("error", title, message),
  info: (title: string, message?: string) => hostRef.current?.show("info", title, message),
};

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 24,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    pointerEvents: "none",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    width: Math.min(SCREEN_W - 32, 420),
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  msg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
    lineHeight: 17,
  },
});
