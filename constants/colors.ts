// Secret Calculator Vault — Color System
// iOS-style dark calculator with vault accent colors

const Colors = {
  // Calculator colors (matches iOS Calculator)
  calc: {
    background: "#000000",
    display: "#000000",
    displayText: "#FFFFFF",
    historyText: "rgba(255,255,255,0.35)",

    // Button types
    numberBg: "#333333",
    numberText: "#FFFFFF",

    operatorBg: "#FF9500",
    operatorText: "#FFFFFF",

    functionBg: "#A5A5A5",
    functionText: "#000000",

    // States
    buttonActive: "rgba(255,255,255,0.15)",
    equalActive: "#E68600",
    operatorSelected: "#FFFFFF",
    operatorSelectedText: "#FF9500",
  },

  // Vault colors (secure, premium dark aesthetic)
  vault: {
    background: "#0A0A0F",
    surface: "#141420",
    surfaceElevated: "#1E1E2E",
    border: "rgba(255,255,255,0.08)",

    accent: "#6C63FF",
    accentLight: "rgba(108,99,255,0.15)",
    accentGlow: "rgba(108,99,255,0.3)",

    text: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.6)",
    textMuted: "rgba(255,255,255,0.3)",

    // PIN pad
    pinDot: "#6C63FF",
    pinDotEmpty: "rgba(255,255,255,0.15)",
    pinButton: "#1E1E2E",
    pinButtonText: "#FFFFFF",
    pinButtonDelete: "#FF3B30",

    // File grid
    fileBg: "#1E1E2E",
    fileBorder: "rgba(108,99,255,0.2)",

    // Danger
    danger: "#FF3B30",
    dangerLight: "rgba(255,59,48,0.15)",

    success: "#30D158",
  },

  // Splash & tutorial
  splash: {
    background: "#1C1C1E",
    accent: "#FF9500",
    text: "#FFFFFF",
  },

  // Tutorial overlay
  tutorial: {
    overlay: "rgba(0,0,0,0.75)",
    highlight: "rgba(255,149,0,0.2)",
    bubble: "#1C1C1E",
    text: "#FFFFFF",
    accent: "#FF9500",
  },
} as const;

export default Colors;
