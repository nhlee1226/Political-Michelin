"use client";

/**
 * 사이트 어디서든 정치인 이름을 누르면 그 바로 옆에 "정치인 상세 페이지로 이동" 버튼을 띄움.
 *
 *  - PoliticianLinkProvider: 루트 레이아웃에 한 번. 떠 있는 버튼(팝오버)을 그림.
 *  - usePoliticianLink().open(id, { name }): 이미 onClick 이 있는 줄·카드에서 부름 (방금 누른 요소 옆에 뜸)
 *  - <PoliticianName id name />: 이름 글자 자체를 누를 수 있게 만드는 작은 컴포넌트 (다른 버튼 안에 있어도 됨)
 *
 * id = 국회의원 MONA_CD 또는 지방선거 당선인 'sgId:sgTypecode:huboid' → /politicians/<id>
 * 바깥을 누르거나 Esc·스크롤하면 닫힘. 지도 버스트(region-burst)가 닫히지 않게 data-burst-keep.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { politicianHref } from "@/lib/politician-profile";
import { cn } from "@/lib/utils";

interface OpenOptions {
  name?: string;
  /** 버튼을 붙일 요소. 없으면 방금 누른(포커스된) 요소 */
  anchor?: Element | null;
}

interface State {
  id: string;
  name?: string;
  x: number;
  y: number;
  /** 앵커 위쪽 끝 — 아래 공간이 모자라면 위로 띄울 때 씀 */
  top: number;
  anchor: Element | null;
}

const Ctx = React.createContext<{ open: (id: string, opts?: OpenOptions) => void; close: () => void } | null>(null);

const POP_W = 248;
const POP_H = 92;
const GAP = 8;
const WIDE = 280; // 이보다 넓은 줄·카드는 누른 지점 옆에 띄움

export function usePoliticianLink() {
  const ctx = React.useContext(Ctx);
  // 공급자 밖(테스트·단독 렌더)에서는 바로 이동
  return (
    ctx ?? {
      open: (id: string) => {
        window.location.href = politicianHref(id);
      },
      close: () => {},
    }
  );
}

export function PoliticianLinkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State | null>(null);
  const last = React.useRef<{ el: Element | null; x: number; y: number; pointer: boolean }>({ el: null, x: 0, y: 0, pointer: false });
  const popRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // 방금 누른 요소·지점 기억 (open 을 부르는 쪽이 이벤트를 넘기지 않아도 위치를 알 수 있게)
  React.useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      last.current = { el: e.target as Element, x: e.clientX, y: e.clientY, pointer: true };
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") last.current = { el: document.activeElement, x: 0, y: 0, pointer: false };
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const close = React.useCallback(() => setState(null), []);

  const open = React.useCallback((id: string, opts?: OpenOptions) => {
    const el = opts?.anchor ?? last.current.el ?? document.activeElement;
    const rect = el && el !== document.body ? el.getBoundingClientRect() : null;
    let x: number, y: number, top: number;
    if (rect && (rect.width <= WIDE || !last.current.pointer)) {
      // 작은 요소(이름 글자·작은 버튼): 요소 바로 아래 왼쪽 맞춤
      x = rect.left;
      y = rect.bottom + GAP;
      top = rect.top - GAP;
    } else {
      // 넓은 줄·카드: 누른 지점 바로 옆
      x = last.current.x + 4;
      y = last.current.y + 14;
      top = last.current.y - 14;
    }
    setState({ id, name: opts?.name, x, y, top, anchor: el });
  }, []);

  // 바깥 누르기·Esc·스크롤·창 크기 변경이면 닫음
  React.useEffect(() => {
    if (!state) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      setState(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setState(null);
      (state.anchor as HTMLElement | null)?.focus?.();
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      setState(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [state, close]);

  // 열리면 이동 버튼에 포커스 (키보드 사용자는 Enter 한 번 더로 이동)
  React.useEffect(() => {
    if (state) popRef.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
  }, [state]);

  const ctx = React.useMemo(() => ({ open, close }), [open, close]);

  let pos: { left: number; top: number } | null = null;
  if (state && typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(state.x, vw - POP_W - 8));
    const below = state.y + POP_H <= vh - 8;
    pos = { left, top: below ? state.y : Math.max(8, state.top - POP_H) };
  }

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {state && pos && (
              <motion.div
                key={state.id}
                ref={popRef}
                data-burst-keep
                data-politician-pop
                role="dialog"
                aria-label={`${state.name ?? "정치인"} 바로가기`}
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                style={{ left: pos.left, top: pos.top, width: POP_W }}
                className="fixed z-[70] rounded-xl border border-line bg-card p-2 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.55)]"
              >
                <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
                  <p className="truncate text-[calc(12px*var(--fs))] font-semibold text-ink">{state.name ?? "정치인"}</p>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="닫기"
                    className="grid size-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-white/[0.08] hover:text-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <Link
                  href={politicianHref(state.id)}
                  onClick={close}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-lime px-3 py-2 text-[calc(13px*var(--fs))] font-semibold text-canvas transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
                >
                  정치인 상세 페이지로 이동
                  <ArrowRight className="size-4" />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

/**
 * 누를 수 있는 정치인 이름. 다른 버튼·링크 안에 있어도 되도록 span(role=button) 으로 그리고,
 * 누르면 바깥 onClick(펼치기·지역 이동 등)은 막고 이동 버튼만 띄움.
 */
export function PoliticianName({
  id,
  name,
  className,
  children,
}: {
  id: string | null | undefined;
  name: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { open } = usePoliticianLink();
  if (!id) return <span className={className}>{children ?? name}</span>;
  const go = (e: React.SyntheticEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    open(id, { name, anchor: e.currentTarget });
  };
  return (
    <span
      role="button"
      tabIndex={0}
      title={`${name} — 정치인 상세 페이지로 이동`}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") go(e);
      }}
      className={cn(
        "cursor-pointer rounded-sm underline decoration-current/30 decoration-dotted underline-offset-[3px] transition hover:text-lime hover:decoration-lime/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
        className,
      )}
    >
      {children ?? name}
    </span>
  );
}
