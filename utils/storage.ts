/**
 * Storage Utils
 * Handles all vault file operations.
 *
 * Native (Android/iOS via Expo Go):
 *   Files are copied into the app's private documents directory using expo-file-system.
 *   They are invisible to the system gallery or file explorer.
 *
 * Web (browser preview):
 *   Files are read as base64 data URIs and stored in AsyncStorage.
 *   Works for photos, videos, and small documents.
 *   Data persists across page reloads inside the browser's localStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Platform } from "react-native";

// Native only — will be null on web
const VAULT_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}vault/`
  : null;

const VAULT_META_KEY = "vault_files_metadata";
const VAULT_PIN_KEY = "vault_pin_hash";
const VAULT_SECRET_KEY = "vault_secret_code";
const FIRST_TIME_KEY = "app_first_time_done";
const WRONG_ATTEMPTS_KEY = "vault_wrong_attempts";
const BIOMETRIC_ENABLED_KEY = "vault_biometric_enabled";

// On web, file data (base64) is stored here separately to keep metadata lean
const VAULT_DATA_PREFIX = "vault_data_";

export type VaultFileType = "photo" | "video" | "document";

export interface VaultFile {
  id: string;
  name: string;
  type: VaultFileType;
  originalUri: string;
  vaultPath: string; // native: file path; web: base64 data URI
  size: number;
  addedAt: number;
  thumbnail?: string;
  isWebFile?: boolean; // true when stored as base64 on web
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ─── Native helper ────────────────────────────────────────────────────────────

async function ensureVaultDir(): Promise<void> {
  if (!VAULT_DIR) return;
  const dirInfo = await FileSystem.getInfoAsync(VAULT_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
  }
}

// ─── Web helper — convert a URI / file to base64 data URI ────────────────────

const WEB_MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB limit for browser storage

async function uriToBase64DataUri(uri: string, mimeType: string): Promise<string> {
  // If it's already a data URI, return as-is
  if (uri.startsWith("data:")) return uri;

  return new Promise((resolve, reject) => {
    fetch(uri)
      .then((r) => r.blob())
      .then((blob) => {
        if (blob.size > WEB_MAX_FILE_BYTES) {
          reject(
            new Error(
              "FILE_TOO_LARGE_FOR_WEB"
            )
          );
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });
}

function guessMime(name: string, type: VaultFileType): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type === "video") return `video/${ext === "mp4" ? "mp4" : "quicktime"}`;
  if (type === "document") return "application/octet-stream";
  // Photo
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

// ─── PIN utilities ────────────────────────────────────────────────────────────

export async function hashPin(pin: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin + "scv_salt_2024"
  );
  return hash;
}

export async function savePin(pin: string): Promise<void> {
  const hashed = await hashPin(pin);
  await AsyncStorage.setItem(VAULT_PIN_KEY, hashed);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await AsyncStorage.getItem(VAULT_PIN_KEY);
  if (!stored) return false;
  return (await hashPin(pin)) === stored;
}

export async function hasPinSet(): Promise<boolean> {
  const pin = await AsyncStorage.getItem(VAULT_PIN_KEY);
  return pin !== null;
}

/** Remove stored PIN so user can set a new one */
export async function resetPin(): Promise<void> {
  await AsyncStorage.removeItem(VAULT_PIN_KEY);
}

// ─── Secret code ──────────────────────────────────────────────────────────────

export async function saveSecretCode(code: string): Promise<void> {
  await AsyncStorage.setItem(VAULT_SECRET_KEY, code);
}

export async function getSecretCode(): Promise<string> {
  const code = await AsyncStorage.getItem(VAULT_SECRET_KEY);
  return code ?? "1337";
}

// ─── Biometric setting ────────────────────────────────────────────────────────

export async function getBiometricEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  return val === null ? true : val === "true"; // default ON
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
}

// ─── Wrong attempts ───────────────────────────────────────────────────────────

export async function getWrongAttempts(): Promise<number> {
  const val = await AsyncStorage.getItem(WRONG_ATTEMPTS_KEY);
  return val ? parseInt(val) : 0;
}

export async function incrementWrongAttempts(): Promise<number> {
  const current = await getWrongAttempts();
  const next = current + 1;
  await AsyncStorage.setItem(WRONG_ATTEMPTS_KEY, next.toString());
  return next;
}

export async function resetWrongAttempts(): Promise<void> {
  await AsyncStorage.setItem(WRONG_ATTEMPTS_KEY, "0");
}

// ─── First-time ───────────────────────────────────────────────────────────────

export async function isFirstTime(): Promise<boolean> {
  const done = await AsyncStorage.getItem(FIRST_TIME_KEY);
  return done === null;
}

export async function markFirstTimeDone(): Promise<void> {
  await AsyncStorage.setItem(FIRST_TIME_KEY, "done");
}

// ─── Vault file metadata ──────────────────────────────────────────────────────

export async function getVaultFiles(): Promise<VaultFile[]> {
  try {
    const raw = await AsyncStorage.getItem(VAULT_META_KEY);
    if (!raw) return [];
    const files = JSON.parse(raw) as VaultFile[];

    // For web files, resolve the stored data URI back into vaultPath
    for (const f of files) {
      if (f.isWebFile) {
        const stored = await AsyncStorage.getItem(VAULT_DATA_PREFIX + f.id);
        if (stored) f.vaultPath = stored;
      }
    }

    return files;
  } catch {
    return [];
  }
}

async function saveVaultFileMeta(files: VaultFile[]): Promise<void> {
  // Store metadata without the large base64 blob
  const lean = files.map((f) => {
    if (f.isWebFile) {
      const { vaultPath, ...rest } = f;
      return { ...rest, vaultPath: "" };
    }
    return f;
  });
  await AsyncStorage.setItem(VAULT_META_KEY, JSON.stringify(lean));
}

// ─── Add file to vault ────────────────────────────────────────────────────────

export async function addFileToVault(
  uri: string,
  name: string,
  type: VaultFileType
): Promise<VaultFile> {
  const id = generateId();

  if (Platform.OS === "web") {
    // Web: convert to base64 data URI and store in AsyncStorage
    const mime = guessMime(name, type);
    const dataUri = await uriToBase64DataUri(uri, mime);

    // Estimate size from base64 length
    const size = Math.round((dataUri.length * 3) / 4);

    const vaultFile: VaultFile = {
      id,
      name,
      type,
      originalUri: uri,
      vaultPath: dataUri,
      size,
      addedAt: Date.now(),
      isWebFile: true,
    };

    // Store the data URI separately (it's large)
    await AsyncStorage.setItem(VAULT_DATA_PREFIX + id, dataUri);

    const files = await getVaultFiles();
    files.unshift(vaultFile);
    await saveVaultFileMeta(files);

    return vaultFile;
  }

  // Native: copy to private vault directory via expo-file-system/legacy
  if (!VAULT_DIR) throw new Error("Vault directory unavailable");

  await ensureVaultDir();

  // Determine file extension — fall back by type if name has none
  let extension = name.split(".").pop() ?? "";
  if (!extension || extension.length > 5) {
    extension = type === "video" ? "mp4" : type === "document" ? "bin" : "jpg";
  }

  const vaultFilename = `${id}.${extension}`;
  const vaultPath = `${VAULT_DIR}${vaultFilename}`;

  try {
    await FileSystem.copyAsync({ from: uri, to: vaultPath });
  } catch (copyErr) {
    console.error("[Vault] copyAsync failed:", copyErr, "\n  from:", uri, "\n  to:", vaultPath);
    throw copyErr;
  }

  const fileInfo = await FileSystem.getInfoAsync(vaultPath, { size: true });
  const size = fileInfo.exists && "size" in fileInfo ? (fileInfo.size ?? 0) : 0;

  // Generate thumbnail for videos
  let thumbnail: string | undefined;
  if (type === "video") {
    try {
      const thumbResult = await VideoThumbnails.getThumbnailAsync(vaultPath, {
        time: 1000,
        quality: 0.7,
      });
      const thumbPath = `${VAULT_DIR}${id}_thumb.jpg`;
      await FileSystem.copyAsync({ from: thumbResult.uri, to: thumbPath });
      thumbnail = thumbPath;
    } catch (thumbErr) {
      console.warn("[Vault] Thumbnail generation failed:", thumbErr);
    }
  }

  const vaultFile: VaultFile = {
    id,
    name,
    type,
    originalUri: uri,
    vaultPath,
    size,
    addedAt: Date.now(),
    isWebFile: false,
    thumbnail,
  };

  const files = await getVaultFiles();
  files.unshift(vaultFile);
  await saveVaultFileMeta(files);

  return vaultFile;
}

// ─── Delete file from vault ───────────────────────────────────────────────────

export async function deleteFileFromVault(fileId: string): Promise<void> {
  const files = await getVaultFiles();
  const file = files.find((f) => f.id === fileId);

  if (file) {
    if (file.isWebFile) {
      // Remove base64 data from AsyncStorage
      await AsyncStorage.removeItem(VAULT_DATA_PREFIX + fileId);
    } else if (VAULT_DIR) {
      // Remove video file and its thumbnail
      const fileInfo = await FileSystem.getInfoAsync(file.vaultPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(file.vaultPath, { idempotent: true });
      }
      if (file.thumbnail) {
        await FileSystem.deleteAsync(file.thumbnail, { idempotent: true });
      }
    }
  }

  const updated = files.filter((f) => f.id !== fileId);
  await saveVaultFileMeta(updated);
}

// ─── Calculator history ────────────────────────────────────────────────────────

const CALC_HISTORY_KEY = "calc_history";
const CALC_HISTORY_MAX = 100;

export interface CalcHistoryRecord {
  expression: string;
  result: string;
  timestamp: number;
}

export async function getCalcHistory(): Promise<CalcHistoryRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(CALC_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as CalcHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export async function addCalcHistoryRecord(
  record: Omit<CalcHistoryRecord, "timestamp">
): Promise<void> {
  try {
    const history = await getCalcHistory();
    const newRecord: CalcHistoryRecord = { ...record, timestamp: Date.now() };
    const updated = [newRecord, ...history].slice(0, CALC_HISTORY_MAX);
    await AsyncStorage.setItem(CALC_HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

export async function deleteCalcHistoryRecord(timestamp: number): Promise<void> {
  try {
    const history = await getCalcHistory();
    const updated = history.filter((r) => r.timestamp !== timestamp);
    await AsyncStorage.setItem(CALC_HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

export async function clearCalcHistory(): Promise<void> {
  await AsyncStorage.removeItem(CALC_HISTORY_KEY);
}

// ─── Format helpers ───────────────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
