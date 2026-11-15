"use client";

/**
 * 로그인 상태에 따라 저장소가 바뀌는 id 집합 훅.
 *  - 로그인: DB (/api/user/items 로 읽고 /api/user/follow·/api/user/bookmark 로 토글)
 *  - 비로그인: localStorage (기존 useStoredSet 과 동일 동작)
 *  - kind="bill": 법안은 mock/example 데이터라 항상 localStorage
 *
 * side-rail 의 관심 지역·즐겨찾는 정치인·저장한 뉴스가 이 훅으로 교체됨.
 * 같은 ITEMS_KEY 키를 공유해 SWR 가 한 번만 요청.
 */
import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { useUser } from "./api";

export type SyncKind = "region" | "politician" | "news" | "bill";

interface UserItems {
  regions: string[];
  politicians: string[];
  news: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

/** SWR 키 — fetcher 가 `${API}${path}` 로 URL 을 조립하므로 키에는 /api 를 붙이지 않는다 (api.ts 패턴) */
const ITEMS_KEY = "/user/items";

async function itemsFetcher(path: string): Promise<UserItems> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error("user items fetch failed");
  const data = await res.json();
  // 비로그인이면 null → 빈 집합
  return data ?? { regions: [], politicians: [], news: [] };
}

function fieldOf(items: UserItems | undefined, kind: SyncKind): string[] {
  if (!items) return [];
  if (kind === "region") return items.regions;
  if (kind === "politician") return items.politicians;
  if (kind === "news") return items.news;
  return [];
}

export function useSyncedSet(storageKey: string, initial: string[], kind: SyncKind) {
  const { data: user, isLoading: userLoading } = useUser();
  const loggedIn = !!user;
  const { mutate } = useSWRConfig();

  // DB 경로: 공유 SWR 키로 모든 패널이 한 번에 읽음
  const { data: items } = useSWR<UserItems>(loggedIn ? ITEMS_KEY : null, itemsFetcher);

  // localStorage 경로 (비로그인 또는 bill)
  const [localSet, setLocalSet] = React.useState<Set<string>>(() => new Set(initial));
  React.useEffect(() => {
    if (loggedIn && kind !== "bill") return; // 로그인 + DB 대상이면 localStorage 안 씀
    try {
      const v = localStorage.getItem(storageKey);
      if (v) setLocalSet(new Set(JSON.parse(v) as string[]));
    } catch {}
  }, [storageKey, loggedIn, kind]);

  const persistLocal = React.useCallback(
    (next: Set<string>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {}
    },
    [storageKey],
  );

  // 현재 집합: 로그인(DB)이면 items 필드, 아니면 localSet
  const current: Set<string> = loggedIn && kind !== "bill" ? new Set(fieldOf(items, kind)) : localSet;

  const toggle = React.useCallback(
    async (id: string) => {
      // ── DB 경로 ──
      if (loggedIn && kind !== "bill") {
        const wasActive = fieldOf(items, kind).includes(id);
        // 낙관적 업데이트
        const optimistic = (prev: UserItems | undefined): UserItems => {
          const base = prev ?? { regions: [], politicians: [], news: [] };
          const arr = [...fieldOf(base, kind)];
          const next = wasActive ? arr.filter((x) => x !== id) : [...arr, id];
          if (kind === "region") return { ...base, regions: next };
          if (kind === "politician") return { ...base, politicians: next };
          return { ...base, news: next };
        };
        await mutate(ITEMS_KEY, optimistic, { revalidate: false });
        try {
          if (kind === "news") {
            await fetch(`${API}/user/bookmark`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ newsId: id }),
            });
          } else {
            await fetch(`${API}/user/follow`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind, targetId: id }),
            });
          }
        } catch {
          // 실패 시 실제 값으로 복구
          await mutate(ITEMS_KEY);
        }
        // 서버 확정값으로 동기화
        await mutate(ITEMS_KEY);
        return;
      }

      // ── localStorage 경로 ──
      setLocalSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persistLocal(next);
        return next;
      });
    },
    [loggedIn, kind, items, mutate, persistLocal],
  );

  const ready = !userLoading && (loggedIn ? !!items : true);

  return [current, toggle, ready] as const;
}
