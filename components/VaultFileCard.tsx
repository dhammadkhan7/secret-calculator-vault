/**
 * VaultFileCard
 * Displays a single file in the vault grid.
 * - Photos: shows actual thumbnail image
 * - Videos: shows video thumbnail (first frame) with play badge overlay
 * - Documents: shows icon
 * Supports long-press to enter selection mode.
 */

import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import Colors from "@/constants/colors";
import { VaultFile, formatDate, formatFileSize } from "@/utils/storage";

const { width } = Dimensions.get("window");
const CARD_SIZE = (width - 48) / 2;

interface VaultFileCardProps {
  file: VaultFile;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function getAccent(type: VaultFile["type"]) {
  switch (type) {
    case "photo":    return "#6C63FF";
    case "video":    return "#FF6B35";
    default:         return "#30D158";
  }
}

function getDocIcon(name: string): keyof typeof Feather.glyphMap {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf", "doc", "docx"].includes(ext)) return "file-text";
  if (["xls", "xlsx"].includes(ext)) return "grid";
  if (["ppt", "pptx"].includes(ext)) return "monitor";
  return "file";
}

export function VaultFileCard({
  file,
  isSelected,
  onPress,
  onLongPress,
}: VaultFileCardProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const accent = getAccent(file.type);

  // Determine what to show as the preview image
  const previewUri =
    file.type === "photo" ? file.vaultPath :
    file.type === "video" ? file.thumbnail ?? null :
    null;

  return (
    <Animated.View style={[styles.wrapper, animStyle]}>
      <Pressable
        onPressIn={() => { scale.value = withTiming(0.95, { duration: 100 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
        onPress={onPress}
        onLongPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onLongPress();
        }}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        {/* Preview area */}
        <View style={[styles.preview, { backgroundColor: accent + "18" }]}>

          {/* Photo or video thumbnail */}
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            /* Fallback icon for videos without a thumbnail or documents */
            <View style={styles.iconArea}>
              <View style={[styles.iconBg, { backgroundColor: accent + "20" }]}>
                <Feather
                  name={
                    file.type === "video" ? "video" :
                    file.type === "photo"  ? "image" :
                    getDocIcon(file.name)
                  }
                  size={28}
                  color={accent}
                />
              </View>
            </View>
          )}

          {/* Play badge — shown on top of video thumbnail (or fallback icon) */}
          {file.type === "video" && (
            <View style={styles.playBadge}>
              <Feather name="play" size={12} color="#fff" />
            </View>
          )}

          {/* Duration / type pill for videos */}
          {file.type === "video" && previewUri && (
            <View style={styles.videoPill}>
              <Feather name="film" size={9} color="rgba(255,255,255,0.9)" />
              <Text style={styles.videoPillText}>VIDEO</Text>
            </View>
          )}

          {/* Selection overlay */}
          {isSelected && (
            <View style={styles.selectionOverlay}>
              <View style={styles.checkCircle}>
                <Feather name="check" size={16} color="#fff" />
              </View>
            </View>
          )}
        </View>

        {/* Meta info */}
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>{file.name}</Text>
          <Text style={styles.info}>
            {formatFileSize(file.size)} · {formatDate(file.addedAt)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: CARD_SIZE,
  },
  card: {
    backgroundColor: Colors.vault.fileBg,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.vault.fileBorder,
  },
  cardSelected: {
    borderColor: Colors.vault.accent,
    borderWidth: 2,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  iconArea: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconBg: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  // Play badge — bottom-right corner
  playBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 14,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },

  // Small "VIDEO" pill — top-left
  videoPill: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  videoPillText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.5,
  },

  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(108,99,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.vault.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    padding: 10,
  },
  name: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.vault.text,
    marginBottom: 3,
  },
  info: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.textMuted,
  },
});
