"use client";

/**
 * 작은 버튼 반응 (마이크로 인터랙션).
 *  - Pop  : 켜고 끌 때 아이콘·버튼이 톡 튐. kind="ring" 이면 켤 때 종처럼 흔들림.
 *           id 를 주면, 그 항목이 방금 눌려 다른 목록으로 옮겨 가 새로 그려질 때도 한 번 반응한다.
 *  - Bump : 숫자가 바뀌면 살짝 커졌다 돌아옴 (예: "추적 중 3건").
 * 처음 화면에 나올 때는 움직이지 않고, 움직임 줄이기를 켠 사람에게는 아무것도 하지 않는다.
 */
import * as React from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { wasJustToggled } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Pop({
  on,
  id,
  kind = "pop",
  className,
  children,
}: {
  on: boolean;
  id?: string;
  kind?: "pop" | "ring";
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  const prev = React.useRef(on);

  const play = React.useCallback(
    (nowOn: boolean) => {
      if (reduce) return;
      if (kind === "ring") {
        if (nowOn) void controls.start({ rotate: [0, -22, 18, -10, 5, 0], transition: { duration: 0.56, ease: "easeOut" } });
        return;
      }
      void controls.start({ scale: [1, 0.84, 1.14, 1], transition: { duration: 0.42, ease: "easeOut" } });
    },
    [controls, kind, reduce],
  );

  React.useEffect(() => {
    if (prev.current === on) return;
    prev.current = on;
    play(on);
  }, [on, play]);

  // 방금 눌려서 다른 목록에 새로 그려진 경우
  React.useEffect(() => {
    if (id && wasJustToggled(id)) play(on);
    // 처음 그려질 때 한 번만 확인
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.span
      animate={controls}
      className={cn("inline-flex items-center justify-center", className)}
      style={{ transformOrigin: kind === "ring" ? "50% 15%" : "50% 50%" }}
    >
      {children}
    </motion.span>
  );
}

export function Bump({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const first = React.useRef(true);
  React.useEffect(() => {
    first.current = false;
  }, []);
  return (
    <motion.span
      key={value}
      className={cn("inline-block tabular", className)}
      initial={first.current || reduce ? false : { scale: 1.5 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 16 }}
    >
      {value}
    </motion.span>
  );
}
