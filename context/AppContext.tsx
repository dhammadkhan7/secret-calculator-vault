/**
 * AppContext
 * Global state for the Secret Calculator Vault app.
 * Tracks: first-time status, vault lock state, wrong attempts.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { isFirstTime, markFirstTimeDone } from "@/utils/storage";

interface AppContextValue {
  // First time
  firstTimeDone: boolean;
  completeTutorial: () => Promise<void>;

  // Vault state
  isVaultUnlocked: boolean;
  unlockVault: () => void;
  lockVault: () => void;

  // Wrong attempts (for fake crash)
  wrongAttempts: number;
  incrementWrong: () => number;
  resetWrong: () => void;

  // Loading
  isLoading: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [firstTimeDone, setFirstTimeDone] = useState(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  // Load initial state
  useEffect(() => {
    async function init() {
      try {
        const firstTime = await isFirstTime();
        setFirstTimeDone(!firstTime);

        const stored = await AsyncStorage.getItem("vault_wrong_attempts");
        setWrongAttempts(stored ? parseInt(stored) : 0);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const completeTutorial = useCallback(async () => {
    await markFirstTimeDone();
    setFirstTimeDone(true);
  }, []);

  const unlockVault = useCallback(() => {
    setIsVaultUnlocked(true);
  }, []);

  const lockVault = useCallback(() => {
    setIsVaultUnlocked(false);
  }, []);

  const incrementWrong = useCallback(() => {
    const next = wrongAttempts + 1;
    setWrongAttempts(next);
    AsyncStorage.setItem("vault_wrong_attempts", next.toString());
    return next;
  }, [wrongAttempts]);

  const resetWrong = useCallback(() => {
    setWrongAttempts(0);
    AsyncStorage.setItem("vault_wrong_attempts", "0");
  }, []);

  return (
    <AppContext.Provider
      value={{
        firstTimeDone,
        completeTutorial,
        isVaultUnlocked,
        unlockVault,
        lockVault,
        wrongAttempts,
        incrementWrong,
        resetWrong,
        isLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
