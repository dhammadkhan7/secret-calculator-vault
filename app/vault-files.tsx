/**
 * VaultFiles Screen (vault-files.tsx)
 * Secure file manager inside the hidden vault.
 *
 * Features:
 *   - Grid view of photos and videos
 *   - Add from gallery (photos/videos), camera, or documents
 *   - Select multiple files for deletion
 *   - Auto-lock after 60 seconds of inactivity
 *   - Change secret code (settings sheet)
 */

import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as MediaLibrary from "expo-media-library";

import { FileViewer } from "@/components/FileViewer";
import { toast } from "@/components/Toast";
import { VaultFileCard } from "@/components/VaultFileCard";
import { useApp } from "@/context/AppContext";
import Colors from "@/constants/colors";
import {
  VaultFile,
  addFileToVault,
  deleteFileFromVault,
  getVaultFiles,
  getSecretCode,
  saveSecretCode,
  resetPin,
  getBiometricEnabled,
  setBiometricEnabled,
} from "@/utils/storage";

type FilterType = "all" | "photo" | "video" | "document";

const FILTER_TABS: {
  key: FilterType;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { key: "all", label: "All", icon: "grid" },
  { key: "photo", label: "Photos", icon: "image" },
  { key: "video", label: "Videos", icon: "video" },
  { key: "document", label: "Docs", icon: "file-text" },
];

function haptic(type: "light" | "medium" | "success" | "error" = "light") {
  if (Platform.OS === "web") return;
  if (type === "success") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else if (type === "error") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } else {
    Haptics.impactAsync(
      type === "medium"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light
    );
  }
}

export default function VaultFilesScreen() {
  const insets = useSafeAreaInsets();
  const { lockVault } = useApp();

  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterType>("all");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newSecretCode, setNewSecretCode] = useState("");
  const [biometricOn, setBiometricOn] = useState(true);
  const [hasBioHardware, setHasBioHardware] = useState(false);
  const [viewingFile, setViewingFile] = useState<VaultFile | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSelecting = selectedIds.size > 0;

  useEffect(() => {
    loadFiles();
    loadSecretCode();
    resetInactivity();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function loadFiles() {
    setLoading(true);
    const vaultFiles = await getVaultFiles();
    setFiles(vaultFiles);
    setLoading(false);
  }

  async function loadSecretCode() {
    const code = await getSecretCode();
    setNewSecretCode(code);
    const bioEnabled = await getBiometricEnabled();
    setBiometricOn(bioEnabled);
    if (Platform.OS !== "web") {
      try {
        const LocalAuth = await import("expo-local-authentication");
        const hw = await LocalAuth.hasHardwareAsync();
        const enrolled = await LocalAuth.isEnrolledAsync();
        setHasBioHardware(hw && enrolled);
      } catch {
        setHasBioHardware(false);
      }
    }
  }

  function resetInactivity() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(handleLock, 60000);
  }

  function handleLock() {
    lockVault();
    router.replace("/");
  }

  const filteredFiles = files.filter(
    (f) => filter === "all" || f.type === filter
  );

  function toggleSelect(id: string) {
    resetInactivity();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    resetInactivity();
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Delete Files",
      `Delete ${selectedIds.size} file${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            haptic("medium");
            for (const id of selectedIds) await deleteFileFromVault(id);
            setSelectedIds(new Set());
            await loadFiles();
          },
        },
      ]
    );
  }

  // ─── IMPORT HANDLERS ─────────────────────────────────────────

  /** Delete an array of assetIds from the system gallery (native only) */
  async function deleteFromGallery(
    assetIds: string[],
    uris: string[]
  ): Promise<void> {
    if (Platform.OS === "web") return;

    try {
      // Request write + read permissions
      const perm = await MediaLibrary.requestPermissionsAsync(false);
      if (perm.status !== "granted") {
        toast.info("Note", "Grant photo access in Settings to auto-remove originals.");
        return;
      }

      // Build final list of IDs to delete
      let idsToDelete: string[] = [...assetIds.filter(Boolean)];

      // Fallback: for any asset where assetId was null, search MediaLibrary by URI
      if (idsToDelete.length < uris.length) {
        for (const uri of uris) {
          try {
            // getAssetsAsync supports filtering by uri on some platforms
            const filename = uri.split("/").pop() ?? "";
            const result = await MediaLibrary.getAssetsAsync({
              first: 5,
              sortBy: [[MediaLibrary.SortBy.creationTime, false]],
            });
            const match = result.assets.find(
              (a) => a.filename === filename || a.uri === uri
            );
            if (match && !idsToDelete.includes(match.id)) {
              idsToDelete.push(match.id);
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (idsToDelete.length === 0) return;

      await MediaLibrary.deleteAssetsAsync(idsToDelete);
      // Deletion succeeded (or system dialog confirmed)
    } catch (e: any) {
      // Android 10+ system dialog rejected, or permission issue — vault copy is safe
      console.warn("[VaultFiles] deleteFromGallery:", e?.message ?? e);
    }
  }

  /** Import photos/videos from gallery, then delete originals from gallery */
  async function handlePickFromGallery() {
    setShowAddSheet(false);
    await new Promise((r) => setTimeout(r, 300));

    // On native, request permission first. Web browsers handle this themselves.
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        toast.error("Permission Needed", "Allow photo library access in Settings to import files.");
        return;
      }
    }

    try {
      setImporting(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 1,
        selectionLimit: 50,
      });

      if (!result.canceled && result.assets.length > 0) {
        let imported = 0;
        let skippedLarge = 0;
        let failed = 0;
        const importedAssetIds: string[] = [];
        const importedUris: string[] = [];

        for (const asset of result.assets) {
          const ext = asset.type === "video" ? "mp4" : "jpg";
          const name = asset.fileName ?? `file_${Date.now()}.${ext}`;
          const fileType = asset.type === "video" ? "video" : "photo";
          try {
            await addFileToVault(asset.uri, name, fileType);
            imported++;
            // Collect both assetId AND uri for deletion fallback
            if (asset.assetId) importedAssetIds.push(asset.assetId);
            importedUris.push(asset.uri);
          } catch (e: any) {
            if (e?.message === "FILE_TOO_LARGE_FOR_WEB") {
              skippedLarge++;
            } else {
              console.error("[VaultFiles] Failed to import asset:", e, asset.uri);
              failed++;
            }
          }
        }

        if (imported > 0) {
          haptic("success");
          await loadFiles();

          // Auto-delete successfully imported files from gallery
          if (Platform.OS !== "web" && importedUris.length > 0) {
            await deleteFromGallery(importedAssetIds, importedUris);
          }
        }

        if (skippedLarge > 0 && imported === 0 && failed === 0) {
          toast.error("File Too Large", "Videos cannot be stored in browser. Use Expo Go for full support.");
        } else if (skippedLarge > 0 && imported > 0) {
          toast.info("Partially Imported", `${imported} hidden from gallery, ${skippedLarge} video${skippedLarge > 1 ? "s" : ""} skipped.`);
        } else if (failed > 0 && imported === 0) {
          toast.error("Import Failed", "Could not import the selected files.");
        } else if (failed > 0) {
          toast.info("Partially Imported", `${imported} hidden, ${failed} failed.`);
        } else if (imported > 0) {
          toast.success("Hidden from Gallery!", `${imported} file${imported > 1 ? "s" : ""} moved to your vault.`);
        }
      }
    } catch (e) {
      console.error("[VaultFiles] Import error:", e);
      toast.error("Error", "Could not import files. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  /** Take a new photo/video with the camera */
  async function handleCamera() {
    setShowAddSheet(false);
    await new Promise((r) => setTimeout(r, 300));

    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        toast.error("Permission Needed", "Allow camera access in Settings to take photos.");
        return;
      }
    }

    try {
      setImporting(true);
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images", "videos"],
        quality: 1,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const name = asset.fileName ?? `photo_${Date.now()}.jpg`;
        await addFileToVault(asset.uri, name, asset.type === "video" ? "video" : "photo");
        haptic("success");
        toast.success("Saved!", "Added to your vault.");
        await loadFiles();
      }
    } catch (e: any) {
      if (e?.message === "FILE_TOO_LARGE_FOR_WEB") {
        toast.error("File Too Large", "Videos need Expo Go — browser storage is limited.");
      } else {
        toast.error("Error", "Could not capture media. Please try again.");
      }
    } finally {
      setImporting(false);
    }
  }

  /** Import documents (PDF, Word, etc.) */
  async function handlePickDocument() {
    setShowAddSheet(false);
    await new Promise((r) => setTimeout(r, 300));

    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          await addFileToVault(asset.uri, asset.name, "document");
        }
        haptic("success");
        toast.success("Imported!", `${result.assets.length} document${result.assets.length > 1 ? "s" : ""} added to your vault.`);
        await loadFiles();
      }
    } catch {
      toast.error("Error", "Could not import documents. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  /** Save changed secret code */
  async function handleSaveSecretCode() {
    if (newSecretCode.length < 4) {
      toast.error("Too Short", "Secret code must be at least 4 digits.");
      return;
    }
    await saveSecretCode(newSecretCode);
    setShowSettings(false);
    haptic("success");
    toast.success("Code Updated!", `New code: ${newSecretCode} → press "=" to open vault.`);
  }

  /** Toggle biometric authentication on/off */
  async function handleToggleBiometric(value: boolean) {
    setBiometricOn(value);
    await setBiometricEnabled(value);
    haptic("light");
  }

  /** Change vault PIN — resets stored PIN and sends user back to PIN setup */
  function handleChangePin() {
    setShowSettings(false);
    Alert.alert(
      "Change Vault PIN",
      "You will be asked to create a new PIN. Your files will stay safe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Change PIN",
          style: "destructive",
          onPress: async () => {
            await resetPin();
            lockVault();
            router.replace("/vault");
          },
        },
      ]
    );
  }

  // ─── RENDER ──────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={isSelecting ? () => setSelectedIds(new Set()) : handleLock}
          style={styles.headerBtn}
          activeOpacity={0.7}
        >
          <Feather
            name={isSelecting ? "x" : "lock"}
            size={20}
            color={Colors.vault.textSecondary}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Feather name="shield" size={15} color={Colors.vault.accent} />
          <Text style={styles.headerTitle}>
            {isSelecting ? `${selectedIds.size} selected` : "Secure Vault"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={
            isSelecting
              ? handleDeleteSelected
              : () => setShowSettings(true)
          }
          style={styles.headerBtn}
          activeOpacity={0.7}
        >
          <Feather
            name={isSelecting ? "trash-2" : "settings"}
            size={20}
            color={isSelecting ? Colors.vault.danger : Colors.vault.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* ── Filter tabs ── */}
      <View style={styles.filterBar}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              resetInactivity();
              setFilter(tab.key);
            }}
            style={[
              styles.filterTab,
              filter === tab.key && styles.filterTabActive,
            ]}
            activeOpacity={0.7}
          >
            <Feather
              name={tab.icon}
              size={13}
              color={filter === tab.key ? Colors.vault.accent : Colors.vault.textMuted}
            />
            <Text
              style={[
                styles.filterTabText,
                filter === tab.key && styles.filterTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Files grid or Empty state ── */}
      {loading ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Loading vault...</Text>
        </View>
      ) : importing ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Importing files...</Text>
        </View>
      ) : filteredFiles.length === 0 ? (
        /* ── Empty state with prominent import buttons ── */
        <ScrollView
          contentContainerStyle={[
            styles.emptyScrollContent,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.emptyIconBg}>
            <Feather name="shield" size={36} color={Colors.vault.accent} />
          </View>
          <Text style={styles.emptyTitle}>Vault is Empty</Text>
          <Text style={styles.emptySubtext}>
            {filter === "all"
              ? "Import photos, videos or documents to store them safely here — hidden from your gallery."
              : `No ${filter}s in your vault yet.`}
          </Text>

          {/* Prominent import buttons — always visible */}
          {filter === "all" && (
            <View style={styles.importButtons}>
              <TouchableOpacity
                onPress={handlePickFromGallery}
                style={[styles.importBtn, { backgroundColor: "#6C63FF" }]}
                activeOpacity={0.8}
              >
                <Feather name="image" size={22} color="#fff" />
                <Text style={styles.importBtnText}>Import from Gallery</Text>
                <Text style={styles.importBtnSub}>Photos & Videos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCamera}
                style={[styles.importBtn, { backgroundColor: "#FF6B35" }]}
                activeOpacity={0.8}
              >
                <Feather name="camera" size={22} color="#fff" />
                <Text style={styles.importBtnText}>Take Photo / Video</Text>
                <Text style={styles.importBtnSub}>From Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePickDocument}
                style={[styles.importBtn, { backgroundColor: "#30A0FF" }]}
                activeOpacity={0.8}
              >
                <Feather name="file-text" size={22} color="#fff" />
                <Text style={styles.importBtnText}>Import Document</Text>
                <Text style={styles.importBtnSub}>PDF, Word, any file</Text>
              </TouchableOpacity>
            </View>
          )}
          {filter !== "all" && (
            <TouchableOpacity
              onPress={() => setShowAddSheet(true)}
              style={[styles.importBtn, { backgroundColor: Colors.vault.accent }]}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={22} color="#fff" />
              <Text style={styles.importBtnText}>Add Files</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: insets.bottom + 100 },
          ]}
          columnWrapperStyle={styles.columnWrapper}
          onScrollBeginDrag={resetInactivity}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <VaultFileCard
              file={item}
              isSelected={selectedIds.has(item.id)}
              onPress={() => {
                resetInactivity();
                if (isSelecting) {
                  // In selection mode, tap toggles selection
                  toggleSelect(item.id);
                } else {
                  // Normal mode, tap opens the file viewer
                  setViewingFile(item);
                }
              }}
              onLongPress={() => {
                haptic("medium");
                toggleSelect(item.id);
              }}
            />
          )}
        />
      )}

      {/* ── FAB (shown when files exist) ── */}
      {!loading && !importing && filteredFiles.length > 0 && (
        <View style={[styles.fab, { bottom: insets.bottom + 28 }]}>
          <TouchableOpacity
            onPress={() => {
              resetInactivity();
              setShowAddSheet(true);
            }}
            style={styles.fabButton}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Add Files Bottom Sheet ── */}
      <Modal
        visible={showAddSheet}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowAddSheet(false)}
      >
        <View style={styles.sheetOverlay}>
          {/* Backdrop tap to close */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowAddSheet(false)}
            activeOpacity={1}
          />
          {/* Sheet card */}
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to Vault</Text>

            <TouchableOpacity
              onPress={handlePickFromGallery}
              style={styles.sheetItem}
              activeOpacity={0.75}
            >
              <View style={[styles.sheetIcon, { backgroundColor: "rgba(108,99,255,0.18)" }]}>
                <Feather name="image" size={22} color="#6C63FF" />
              </View>
              <View style={styles.sheetItemText}>
                <Text style={styles.sheetItemTitle}>Photo Library</Text>
                <Text style={styles.sheetItemSub}>Import photos & videos</Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.vault.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCamera}
              style={styles.sheetItem}
              activeOpacity={0.75}
            >
              <View style={[styles.sheetIcon, { backgroundColor: "rgba(255,107,53,0.18)" }]}>
                <Feather name="camera" size={22} color="#FF6B35" />
              </View>
              <View style={styles.sheetItemText}>
                <Text style={styles.sheetItemTitle}>Camera</Text>
                <Text style={styles.sheetItemSub}>Take a new photo or video</Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.vault.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickDocument}
              style={styles.sheetItem}
              activeOpacity={0.75}
            >
              <View style={[styles.sheetIcon, { backgroundColor: "rgba(48,160,255,0.18)" }]}>
                <Feather name="file-text" size={22} color="#30A0FF" />
              </View>
              <View style={styles.sheetItemText}>
                <Text style={styles.sheetItemTitle}>Documents</Text>
                <Text style={styles.sheetItemSub}>PDF, Word, and any file</Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.vault.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Settings Bottom Sheet ── */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowSettings(false)}
            activeOpacity={1}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Vault Settings</Text>

            <View style={styles.settingSection}>
              <View style={styles.settingLabelRow}>
                <Feather name="key" size={16} color={Colors.vault.accent} />
                <Text style={styles.settingLabel}>Secret Code</Text>
              </View>
              <Text style={styles.settingHint}>
                Type this on the calculator then press "=" to open the vault
              </Text>
              <TextInput
                style={styles.codeInput}
                value={newSecretCode}
                onChangeText={setNewSecretCode}
                keyboardType="numeric"
                maxLength={8}
                placeholder="Enter new code"
                placeholderTextColor={Colors.vault.textMuted}
              />
              <TouchableOpacity
                onPress={handleSaveSecretCode}
                style={styles.saveBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleChangePin}
              style={styles.changePinBtn}
              activeOpacity={0.8}
            >
              <Feather name="lock" size={18} color={Colors.vault.accent} />
              <Text style={styles.changePinBtnText}>Change Vault PIN</Text>
              <Feather name="chevron-right" size={16} color={Colors.vault.textMuted} />
            </TouchableOpacity>

            {/* Biometric toggle — always visible, disabled if hardware unavailable */}
            <View style={[styles.toggleRow, !hasBioHardware && { opacity: 0.45 }]}>
              <View style={styles.toggleLeft}>
                <Feather name="cpu" size={18} color={Colors.vault.accent} />
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleLabel}>Fingerprint / Face ID</Text>
                  <Text style={styles.toggleSub}>
                    {hasBioHardware
                      ? "Auto-prompt on vault open"
                      : "No biometrics enrolled on this device"}
                  </Text>
                </View>
              </View>
              <Switch
                value={hasBioHardware ? biometricOn : false}
                onValueChange={hasBioHardware ? handleToggleBiometric : undefined}
                disabled={!hasBioHardware}
                trackColor={{ false: Colors.vault.surfaceElevated, true: Colors.vault.accent + "88" }}
                thumbColor={hasBioHardware && biometricOn ? Colors.vault.accent : Colors.vault.textMuted}
              />
            </View>

            <TouchableOpacity
              onPress={handleLock}
              style={styles.dangerBtn}
              activeOpacity={0.8}
            >
              <Feather name="log-out" size={18} color={Colors.vault.danger} />
              <Text style={styles.dangerBtnText}>Lock Vault Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── File Viewer ── */}
      <FileViewer
        file={viewingFile}
        allFiles={files}
        onClose={() => setViewingFile(null)}
        onDeleted={() => {
          setViewingFile(null);
          loadFiles();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.vault.background,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.vault.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.vault.text,
  },

  // ── Filter tabs ──
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.vault.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterTabActive: {
    backgroundColor: Colors.vault.accentLight,
    borderColor: Colors.vault.accentGlow,
  },
  filterTabText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.vault.textMuted,
  },
  filterTabTextActive: {
    color: Colors.vault.accent,
  },

  // ── Grid ──
  grid: {
    paddingHorizontal: 12,
    gap: 12,
    paddingTop: 4,
  },
  columnWrapper: {
    gap: 12,
  },

  // ── Empty / loading states ──
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 24,
    gap: 14,
  },
  emptyIconBg: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: Colors.vault.accentLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.vault.accentGlow,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.vault.text,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.textMuted,
    textAlign: "center",
  },

  // ── Import buttons (empty state) ──
  importButtons: {
    width: "100%",
    gap: 12,
  },
  importBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 14,
  },
  importBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    flex: 1,
  },
  importBtnSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.65)",
  },

  // ── FAB ──
  fab: {
    position: "absolute",
    right: 24,
    zIndex: 50,
  },
  fabButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.vault.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.vault.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },

  // ── Bottom sheets ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1C1C2E",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.vault.text,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.vault.surfaceElevated,
    borderRadius: 16,
    padding: 16,
  },
  sheetIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetItemText: {
    flex: 1,
    gap: 2,
  },
  sheetItemTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.vault.text,
  },
  sheetItemSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.textSecondary,
  },

  // ── Settings ──
  settingSection: {
    gap: 10,
  },
  settingLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.vault.text,
  },
  settingHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.textSecondary,
    lineHeight: 18,
  },
  codeInput: {
    backgroundColor: Colors.vault.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    fontSize: 22,
    fontFamily: "Inter_500Medium",
    color: Colors.vault.text,
    letterSpacing: 6,
    borderWidth: 1,
    borderColor: Colors.vault.border,
  },
  saveBtn: {
    backgroundColor: Colors.vault.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.vault.dangerLight,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.2)",
  },
  dangerBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.vault.danger,
  },
  changePinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.vault.accentLight,
    borderWidth: 1,
    borderColor: Colors.vault.accentGlow,
  },
  changePinBtnText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.vault.accent,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.vault.surfaceElevated,
    marginTop: 10,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  toggleTextCol: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.vault.text,
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.vault.textMuted,
    marginTop: 2,
  },
});
