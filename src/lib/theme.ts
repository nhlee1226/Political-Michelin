"use client";

/**
 * 다크/라이트 테마 — <html data-theme="light"> 로 globals.css 의 색 토큰을 교체한다.
 * 첫 페인트 깜빡임은 layout.tsx 의 THEME_INIT_SCRIPT 가 막고, 선택은 localStorage("pm-theme") 에 저장한다.
 */
import * as React from "react";

export type Theme = "dark" | "light";
const KEY = "pm-theme";

const listeners = new Set<() => void>();
const read = (): Theme =>
  typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";

export function setTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  listeners.forEach((l) => l());
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "dark" as Theme,
  );
  return [theme, setTheme];
}
