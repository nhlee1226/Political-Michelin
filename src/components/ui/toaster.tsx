"use client";

/**
 * 화면 아래 가운데에 잠깐 떴다 사라지는 알림 (src/lib/toast.ts 의 toast() 로 띄움).
 * 3.2초 뒤 저절로 사라지고, 되돌리기가 있으면 버튼을 보여 준다.
 * 움직임 줄이기를 켠 사람에게는 튀는 움직임 없이 나타나고 사라지기만 한다.
 */
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { dismissToast, useToast } from "@/lib/toast";

const SHOW_MS = 3200;

export function Toaster() {
  const t = useToast();
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => dismissToast(t.id), SHOW_MS);
    return () => clearTimeout(h);
  }, [t]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(24px+env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-4"
    >
      <AnimatePresence mode="wait">
        {t && (
          <motion.div
            key={t.id}
            data-toast
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: 0.18, ease: "easeIn" } }}
            transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 30 }}
            className="glass-overlay pointer-events-auto flex min-w-0 max-w-[min(480px,100%)] items-center gap-2.5 rounded-full py-1.5 pl-2 pr-1.5"
          >
            <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-lime text-canvas">
              <Check className="size-3.5" strokeWidth={3} aria-hidden />
            </span>
            <p className="min-w-0 truncate text-[calc(13px*var(--fs))]">
              {t.title && <b className="font-semibold">{t.title} </b>}
              {t.message}
            </p>
            {t.undo ? (
              <button
                type="button"
                onClick={() => {
                  const undo = t.undo;
                  dismissToast(t.id);
                  undo?.();
                }}
                className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1 text-[calc(12px*var(--fs))] font-semibold transition hover:bg-white/[0.14]"
              >
                되돌리기
              </button>
            ) : (
              <span className="w-1" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
