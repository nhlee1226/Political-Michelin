"use client";

/**
 * 글자 크기 설정 (빠른 메뉴 → 설정 → 글자 크기) — 브라우저 확대가 아니라 사이트 글자만 키우고 줄인다.
 * <html data-font-size="sm|lg|xl"> 가 globals.css 의 --fs(글자 배율)를 바꾸고, 모든 글자 크기 클래스가 이 배율을 곱한다.
 * 첫 페인트 깜빡임은 layout.tsx 의 초기화 스크립트가 막고, 선택은 localStorage("pm-font-size") 에 저장한다.
 */
import * as React from "react";

export type FontSize = "sm" | "md" | "lg" | "xl";
const KEY = "pm-font-size";

/** globals.css 의 html[data-font-size] 배율과 같음 */
export const FONT_SIZES: { value: FontSize; label: string; scale: number }[] = [
  { value: "sm", label: "작게", scale: 0.92 },
  { value: "md", label: "보통", scale: 1 },
  { value: "lg", label: "크게", scale: 1.12 },
  { value: "xl", label: "아주 크게", scale: 1.25 },
];

const listeners = new Set<() => void>();
const read = (): FontSize => {
  if (typeof document === "undefined") return "md";
  const v = document.documentElement.dataset.fontSize;
  return v === "sm" || v === "lg" || v === "xl" ? v : "md";
};

export function setFontSize(v: FontSize) {
  const root = document.documentElement;
  if (v === "md") delete root.dataset.fontSize;
  else root.dataset.fontSize = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {}
  listeners.forEach((l) => l());
}

export function useFontSize(): [FontSize, (v: FontSize) => void] {
  const v = React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "md" as FontSize,
  );
  return [v, setFontSize];
}
