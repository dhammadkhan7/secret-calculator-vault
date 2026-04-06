/**
 * FileViewer
 * Full-screen modal for viewing vault files:
 *  - Photos: swipeable slider (all vault photos) with pinch-to-zoom per slide
 *  - Videos: native video player (expo-video)
 *  - Documents: file info + share/open via another app
 *
 * Bottom actions:
 *  - "Save to Gallery"  — exports photo/video back to device gallery
 *  - "Share / Open"     — system share sheet
 *  - Delete button in header (deletes the currently-viewed file)
 *
 * Note: Uses an inline ModalToast instead of the global toast because React Native
 * Modal renders at native layer above the app view tree — global toasts are hidden.
 */

import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { VaultFile, deleteFileFromVault, formatDate, formatFileSize } from "@/utils/storage";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── Inline toast (renders inside the Modal so it's above modal content) ──────

type ToastKind = "success" | "error" | "info";

const TOAST_META: Record<ToastKind, { icon: keyof typeof Feather.glyphMap; color: string; bg: string; border: string }> = {
  success: { icon: "check-circle", color: "#34C759", bg: "#1A2A1A", border: "#34C75930" },
  error:   { icon: "alert-circle", color: "#FF453A", bg: "#2A1A1A", border: "#FF453A30" },
  info:    { icon: "info",         color: "#7B61FF", bg: "#1A1A2E", border: "#7B61FF30" },
};

function ModalToast({ title, message, kind, visible }: {
  title: string;
  message?: string;
  kind: ToastKind;
  visible: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const m = TOAST_META[kind];

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  }, [visible]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });

  return (
    <Animated.View
      style={[
        styles.inlineToast,
        { backgroundColor: m.bg, borderColor: m.border, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.toastIconBg, { backgroundColor: m.color + "22" }]}>
        <Feather name={m.icon} size={20} color={m.color} />
      </View>
      <View style={styles.toastText}>
        <Text style={[styles.toastTitle, { color: m.color }]}>{title}</Text>
        {!!message && <Text style={styles.toastMsg} numberOfLines={2}>{message}</Text>}
      </View>
    </Animated.View>
  );
}

// ─── Video sub-component (hook must live at top level) ────────────────────────

function VaultVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
      />
    </View>
  );
}

// ─── Photo slide item ─────────────────────────────────────────────────────────

function PhotoSlide({ uri }: { uri: string }) {
  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={styles.imageContainer}
      maximumZoomScale={4}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      centerContent
    >
      <Image
        source={{ uri }}
        style={styles.fullImage}
        contentFit="contain"
        cachePolicy="memory"
      />
    </ScrollView>
  );
}

// ─── Page dots ────────────────────────────────────────────────────────────────

function PageDots({ total, current }: { total: number; current: number }) {
  if (total <= 1) return null;
  const dots = total > 20 ? null : Array.from({ length: total }, (_, i) => i);
  if (!dots) {
    return (
      <View style={styles.pageCounter}>
        <Text style={styles.pageCounterText}>{current + 1} / {total}</Text>
      </View>
    );
  }
  return (
    <View style={styles.dotsRow}>
      {dots.map(i => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

// ─── Main FileViewer ──────────────────────────────────────────────────────────

interface FileViewerProps {
  file: VaultFile | null;
  allFiles: VaultFile[];
  onClose: () => void;
  onDeleted: () => void;
}

export function FileViewer({ file, allFiles, onClose, onDeleted }: FileViewerProps) {
  const [saving, setSaving] = useState(false);

  // Inline toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastKind, setToastKind] = useState<ToastKind>("success");
  const [toastTitle, setToastTitle] = useState("");
  const [toastMsg, setToastMsg] = useState<string | undefined>();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Photo slider state
  const photoFiles = allFiles.filter(f => f.type === "photo");
  const initialPhotoIndex = file ? photoFiles.findIndex(f => f.id === file.id) : 0;
  const safeInitial = initialPhotoIndex < 0 ? 0 : initialPhotoIndex;
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(safeInitial);
  const flatListRef = useRef<FlatList>(null);

  // Video navigation state
  const videoFiles = allFiles.filter(f => f.type === "video");
  const initialVideoIndex = file?.type === "video" ? videoFiles.findIndex(f => f.id === file.id) : 0;
  const [currentVideoIndex, setCurrentVideoIndex] = useState(Math.max(0, initialVideoIndex));

  // viewability config — stable ref so FlatList doesn't re-render on every render
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentPhotoIndex(viewableItems[0].index);
      }
    },
    []
  );

  function showToast(kind: ToastKind, title: string, msg?: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastKind(kind);
    setToastTitle(title);
    setToastMsg(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3200);
  }

  if (!file) return null;

  // The "active" file — swiped-to photo, current video, or original doc
  const activeFile =
    file.type === "photo" && photoFiles.length > 0
      ? photoFiles[currentPhotoIndex] ?? file
      : file.type === "video" && videoFiles.length > 0
      ? videoFiles[currentVideoIndex] ?? file
      : file;

  const isMedia = activeFile.type === "photo" || activeFile.type === "video";

  // ── Save to gallery ──────────────────────────────────────────────────────────
  async function handleSaveToGallery() {
    if (Platform.OS === "web") {
      showToast("info", "Not available", "Saving to gallery works on Android/iOS only.");
      return;
    }
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== "granted") {
        await tryShare("Save");
        return;
      }
      await MediaLibrary.saveToLibraryAsync(activeFile.vaultPath);
      showToast("success", "Saved to Gallery!", `"${activeFile.name}" exported successfully.`);
    } catch (e: any) {
      if (String(e).toLowerCase().includes("permission")) {
        await tryShare("Save");
      } else {
        console.error("[FileViewer] saveToLibraryAsync:", e);
        showToast("error", "Couldn't save", "Tap 'Share / Open' to export manually.");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Share / export ───────────────────────────────────────────────────────────
  async function handleShare() {
    if (Platform.OS === "web") {
      showToast("info", "Not available", "Sharing works on Android/iOS only.");
      return;
    }
    await tryShare("Share");
  }

  async function tryShare(action: "Save" | "Share") {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showToast("error", "Not supported", "Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(activeFile.vaultPath, {
        dialogTitle: action === "Save"
          ? `Save "${activeFile.name}" to your device`
          : `Export "${activeFile.name}"`,
        UTI: activeFile.type === "photo" ? "public.image"
           : activeFile.type === "video" ? "public.movie"
           : undefined,
      });
    } catch (e) {
      console.error("[FileViewer] shareAsync:", e);
      showToast("error", "Share failed", "Could not open the share sheet.");
    }
  }

  // ── Delete (deletes the currently-viewed file) ────────────────────────────
  function handleDelete() {
    Alert.alert(
      "Delete File",
      `Delete "${activeFile.name}"?\n\nThis cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteFileFromVault(activeFile.id);
            onDeleted();
            onClose();
          },
        },
      ]
    );
  }

  // ── Document icon ────────────────────────────────────────────────────────────
  function getDocIcon(): keyof typeof Feather.glyphMap {
    const ext = activeFile.name.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf", "doc", "docx"].includes(ext)) return "file-text";
    if (["xls", "xlsx"].includes(ext)) return "grid";
    if (["ppt", "pptx"].includes(ext)) return "monitor";
    return "file";
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <SafeAreaView edges={["top"]} style={styles.topBarSafe}>
          <View style={styles.topBar}>
            <Pressable onPress={onClose} style={styles.topBtn} hitSlop={12}>
              <Feather name="x" size={22} color="#fff" />
            </Pressable>

            <View style={styles.topCenter}>
              <Text style={styles.topTitle} numberOfLines={1}>{activeFile.name}</Text>
              <Text style={styles.topSub}>
                {formatFileSize(activeFile.size)} · {formatDate(activeFile.addedAt)}
              </Text>
            </View>

            <Pressable onPress={handleDelete} style={styles.topBtn} hitSlop={12}>
              <Feather name="trash-2" size={20} color="#FF453A" />
            </Pressable>
          </View>
        </SafeAreaView>

        {/* ── Photo slider (swipeable) ─────────────────────────────────────── */}
        {file.type === "photo" && (
          <View style={styles.sliderWrapper}>
            <FlatList
              ref={flatListRef}
              data={photoFiles}
              keyExtractor={item => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={safeInitial}
              getItemLayout={(_, index) => ({
                length: SCREEN_W,
                offset: SCREEN_W * index,
                index,
              })}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig.current}
              decelerationRate="fast"
              renderItem={({ item }) => <PhotoSlide uri={item.vaultPath} />}
              onScrollToIndexFailed={() => {}}
              removeClippedSubviews
              windowSize={3}
              maxToRenderPerBatch={2}
              initialNumToRender={3}
            />

            {/* Page indicator */}
            <PageDots total={photoFiles.length} current={currentPhotoIndex} />
          </View>
        )}

        {/* ── Video ─────────────────────────────────────────────────────────── */}
        {file.type === "video" && Platform.OS !== "web" && (
          <View style={styles.videoWrapper}>
            {/* key forces remount when video changes, resetting the player */}
            <VaultVideoPlayer key={activeFile.id} uri={activeFile.vaultPath} />

            {/* Prev / Next navigation */}
            {videoFiles.length > 1 && (
              <>
                {currentVideoIndex > 0 && (
                  <Pressable
                    style={[styles.videoNavBtn, styles.videoNavLeft]}
                    onPress={() => setCurrentVideoIndex(i => i - 1)}
                    hitSlop={12}
                  >
                    <View style={styles.videoNavCircle}>
                      <Feather name="chevron-left" size={26} color="#fff" />
                    </View>
                  </Pressable>
                )}
                {currentVideoIndex < videoFiles.length - 1 && (
                  <Pressable
                    style={[styles.videoNavBtn, styles.videoNavRight]}
                    onPress={() => setCurrentVideoIndex(i => i + 1)}
                    hitSlop={12}
                  >
                    <View style={styles.videoNavCircle}>
                      <Feather name="chevron-right" size={26} color="#fff" />
                    </View>
                  </Pressable>
                )}
                <View style={styles.videoCounter}>
                  <Text style={styles.videoCounterText}>
                    {currentVideoIndex + 1} / {videoFiles.length}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {file.type === "video" && Platform.OS === "web" && (
          <View style={styles.docContainer}>
            <View style={[styles.docIconBg, { backgroundColor: "rgba(255,107,53,0.15)" }]}>
              <Feather name="video" size={52} color="#FF6B35" />
            </View>
            <Text style={styles.docName}>{activeFile.name}</Text>
            <Text style={styles.docMeta}>{formatFileSize(activeFile.size)} · Video</Text>
            <Text style={styles.docHint}>
              Video playback requires Expo Go.{"\n"}
              Tap "Share / Open" to download it.
            </Text>
          </View>
        )}

        {/* ── Document ─────────────────────────────────────────────────────── */}
        {file.type === "document" && (
          <View style={styles.docContainer}>
            <View style={[styles.docIconBg, { backgroundColor: "rgba(48,160,255,0.15)" }]}>
              <Feather name={getDocIcon()} size={52} color="#30A0FF" />
            </View>
            <Text style={styles.docName}>{file.name}</Text>
            <Text style={styles.docMeta}>{formatFileSize(file.size)} · Document</Text>
            <Text style={styles.docHint}>
              Tap "Share / Open" below to open in another app or save to Downloads.
            </Text>
          </View>
        )}

        {/* ── Bottom actions ─────────────────────────────────────────────────── */}
        <SafeAreaView edges={["bottom"]} style={styles.bottomBarSafe}>
          <View style={styles.bottomBar}>
            {isMedia && Platform.OS !== "web" && (
              <Pressable
                onPress={handleSaveToGallery}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                disabled={saving}
              >
                <Feather name="download" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>
                  {saving ? "Saving…" : "Save to Gallery"}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleShare}
              style={[
                styles.actionBtn,
                isMedia && Platform.OS !== "web"
                  ? styles.actionBtnSecondary
                  : styles.actionBtnPrimary,
              ]}
            >
              <Feather
                name="share-2"
                size={18}
                color={isMedia && Platform.OS !== "web" ? Colors.vault.text : "#fff"}
              />
              <Text
                style={[
                  styles.actionBtnText,
                  isMedia && Platform.OS !== "web" && styles.actionBtnTextSecondary,
                ]}
              >
                Share / Open
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>

        {/* ── Inline toast ──────────────────────────────────────────────────── */}
        <View style={styles.toastLayer} pointerEvents="none">
          <ModalToast
            kind={toastKind}
            title={toastTitle}
            message={toastMsg}
            visible={toastVisible}
          />
        </View>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBarSafe: {
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  bottomBarSafe: {
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  topCenter: {
    flex: 1,
    alignItems: "center",
  },
  topTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textAlign: "center",
  },
  topSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },

  // Photo slider
  sliderWrapper: {
    flex: 1,
  },
  imageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: SCREEN_H * 0.7,
  },
  fullImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.72,
  },

  // Page dots
  dotsRow: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 18,
    height: 6,
    backgroundColor: "#fff",
  },
  dotInactive: {
    width: 6,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  pageCounter: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pageCounterText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  // Video
  videoWrapper: {
    flex: 1,
    backgroundColor: "#000",
    position: "relative",
  },
  videoContainer: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    width: SCREEN_W,
    height: SCREEN_H * 0.6,
  },
  videoNavBtn: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 72,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  videoNavLeft: {
    left: 0,
  },
  videoNavRight: {
    right: 0,
  },
  videoNavCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  videoCounter: {
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  videoCounterText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },

  // Document
  docContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  docIconBg: {
    width: 110,
    height: 110,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  docName: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textAlign: "center",
  },
  docMeta: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  docHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.vault.accent,
  },
  actionBtnSecondary: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  actionBtnTextSecondary: {
    color: Colors.vault.text,
  },

  // Inline toast
  toastLayer: {
    position: "absolute",
    bottom: 110,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
  },
  inlineToast: {
    flexDirection: "row",
    alignItems: "center",
    width: Math.min(SCREEN_W - 32, 400),
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 14,
  },
  toastIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toastText: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  toastMsg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
    lineHeight: 17,
  },
});
