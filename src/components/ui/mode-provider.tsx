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
import { useQuality } from "@/lib/quality/QualityProvider";
import { type QualityMode } from "@/lib/quality/types";

export { QUALITY_MODES, type QualityMode } from "@/lib/quality/types";

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
  initialTheme = "light",
  children,
}: {
  initialMode?: QualityMode;
  initialTheme?: ColorTheme;
  children: ReactNode;
}) {
  const quality = useQuality();
  const [theme, setThemeState] = useState<ColorTheme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setMode = quality.previewMode;
  const setTheme = useCallback((next: ColorTheme) => {
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ mode: quality.mode, theme, setMode, setTheme }),
    [quality.mode, theme, setMode, setTheme],
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
