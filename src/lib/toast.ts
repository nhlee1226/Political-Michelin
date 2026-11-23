"use client";

/**
 * 토스트(잠깐 떴다 사라지는 알림) — 추적·저장·즐겨찾기·관심 지역을 눌렀을 때 "됐어요"를 알려 준다.
 * 화면에는 한 번에 하나만 (새 알림이 오면 바꿔 끼움). 그리는 곳은 src/components/ui/toaster.tsx.
 *
 * 그리고 "방금 누른 항목" 표시: 항목이 다른 목록으로 옮겨 가며 새로 그려질 때(예: 법안 → 추적 중 목록)
 * 그 자리에서 버튼 반응을 한 번 더 보여 주려고 id 와 시각을 잠깐 기억한다 (ui/pop.tsx).
 */
import * as React from "react";

export interface ToastItem {
  id: number;
  /** 굵게 보일 앞부분 (예: "도로교통법 개정안") */
  title?: string;
  message: string;
  /** 있으면 "되돌리기" 버튼 */
  undo?: () => void;
}

let current: ToastItem | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<ToastItem, "id">) {
  current = { ...t, id: ++seq };
  emit();
}

export function dismissToast(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  emit();
}

export function useToast() {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

/** 받침 있으면 "을", 없으면 "를" (한글이 아니면 "을(를)") */
export function eulReul(word: string) {
  const c = word.charCodeAt(word.length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return "을(를)";
  return (c - 0xac00) % 28 ? "을" : "를";
}

let lastToggled: { id: string; at: number } | null = null;
export function markToggled(id: string) {
  lastToggled = { id, at: Date.now() };
}
/** 5초 안에 누른 항목이면 true — 목록을 옮겨 새로 그려진 버튼이 반응을 이어서 보여 줌 */
export function wasJustToggled(id: string) {
  return !!lastToggled && lastToggled.id === id && Date.now() - lastToggled.at < 5000;
}
