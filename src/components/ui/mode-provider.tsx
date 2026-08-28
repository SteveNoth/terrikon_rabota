"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const QUALITY_MODES = ["full", "lite", "ultra"] as const;
export type QualityMode = (typeof QUALITY_MODES)[number];

export const COLOR_THEMES = ["light", "dark"] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

type ModeContextValue = {
  mode: QualityMode;
  theme: ColorTheme;
  setMode: (mode: QualityMode) => void;
  setTheme: (theme: ColorTheme) => void;
};

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({
  initialMode,
  initialTheme = "light",
  children,
}: {
  initialMode: QualityMode;
  initialTheme?: ColorTheme;
  children: ReactNode;
}) {
  const [mode, setModeState] = useState<QualityMode>(initialMode);
  const [theme, setThemeState] = useState<ColorTheme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.theme = theme;
  }, [mode, theme]);

  const setMode = useCallback((next: QualityMode) => {
    setModeState(next);
  }, []);

  const setTheme = useCallback((next: ColorTheme) => {
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ mode, theme, setMode, setTheme }),
    [mode, theme, setMode, setTheme],
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useUiMode(): ModeContextValue {
  const value = useContext(ModeContext);
  if (!value) {
    throw new Error("useUiMode нужно вызывать внутри ModeProvider");
  }
  return value;
}
