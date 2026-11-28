"use client";

/**
 * 국가 구조 펼침 트리 — 위 기관에서 아래 기관으로 선을 이어 보여 준다.
 *  - 칸 누르기: 아래 기관 펼치기/접기 + 선택(설명 카드)
 *  - 마우스 올리기·키보드 포커스: 칸 옆에 짧은 설명 툴팁 (터치에서는 띄우지 않음 — 누르면 설명 카드)
 *  - 키보드: ↑↓ 이동, → 펼치기/첫 자식, ← 접기/부모, Enter·Space 선택, Home/End
 * 데이터·순서 함수: src/lib/encyclopedia/state-structure.ts
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { findPath, visibleIds, type OrgNode } from "@/lib/encyclopedia/state-structure";

interface TreeProps {
  root: OrgNode;
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onToggle: (id: string, open?: boolean) => void;
  onSelect: (id: string) => void;
  /** 좁은 화면에서 선택한 칸 바로 아래에 넣을 설명 카드 */
  inlineDetail?: (node: OrgNode) => React.ReactNode;
}

type Tip = { node: OrgNode; x: number; y: number; below: boolean } | null;

/** 한 층 들여쓰기(px) = ul 의 ml(14) + 세로선(2) + pl(10). 좁은 화면 설명 카드를 트리 왼쪽 끝에 맞출 때 씀 */
const INDENT = 26;

export function StateTree({ root, expanded, selectedId, onToggle, onSelect, inlineDetail }: TreeProps) {
  const [focusId, setFocusId] = React.useState(selectedId ?? root.id);
  const [tip, setTip] = React.useState<Tip>(null);
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());
  const keyboardMove = React.useRef(false);
  const lastPointer = React.useRef<string>("mouse");

  // 선택이 바뀌면(주소로 열거나 설명 카드에서 고를 때) 포커스 위치도 따라감
  React.useEffect(() => {
    if (selectedId) setFocusId(selectedId);
  }, [selectedId]);

  // 키보드로 옮겼을 때만 실제 포커스 이동 (마우스 클릭으로 화면이 튀지 않게)
  React.useEffect(() => {
    if (!keyboardMove.current) return;
    keyboardMove.current = false;
    rowRefs.current.get(focusId)?.focus();
  }, [focusId]);

  React.useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tip]);

  const showTip = (node: OrgNode, el: HTMLElement) => {
    const label = el.querySelector("[data-label]") ?? el;
    const r = label.getBoundingClientRect();
    const below = r.top < 170;
    const half = Math.min(150, window.innerWidth / 2 - 8);
    const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    setTip({ node, x, y: below ? r.bottom + 8 : r.top - 8, below });
  };

  const move = (id: string | undefined) => {
    if (!id) return;
    keyboardMove.current = true;
    setFocusId(id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const order = visibleIds(root, expanded);
    const i = order.indexOf(focusId);
    const path = findPath(focusId, root);
    const node = path?.at(-1);
    if (!node) return;
    const hasKids = !!node.children?.length;
    const open = expanded.has(node.id);
    switch (e.key) {
      case "ArrowDown":
        move(order[i + 1]);
        break;
      case "ArrowUp":
        move(order[i - 1]);
        break;
      case "Home":
        move(order[0]);
        break;
      case "End":
        move(order.at(-1));
        break;
      case "ArrowRight":
        if (hasKids && !open) onToggle(node.id, true);
        else if (hasKids) move(node.children![0].id);
        break;
      case "ArrowLeft":
        if (hasKids && open) onToggle(node.id, false);
        else move(path!.at(-2)?.id);
        break;
      case "Enter":
      case " ":
        onSelect(node.id);
        if (hasKids) onToggle(node.id);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const renderNode = (node: OrgNode, depth: number): React.ReactNode => {
    const kids = node.children ?? [];
    const open = expanded.has(node.id);
    const selected = selectedId === node.id;
    return (
      <li key={node.id} role="none" className={cn(depth > 0 && "relative before:absolute before:-left-[10px] before:top-[1.35em] before:h-0.5 before:w-[10px] before:bg-white/40")}>
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(node.id, el);
            else rowRefs.current.delete(node.id);
          }}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selected}
          aria-expanded={kids.length ? open : undefined}
          aria-describedby={tip?.node.id === node.id ? "state-tree-tip" : undefined}
          tabIndex={focusId === node.id ? 0 : -1}
          data-node={node.id}
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType;
          }}
          onPointerEnter={(e) => {
            lastPointer.current = e.pointerType;
            if (e.pointerType === "mouse") showTip(node, e.currentTarget);
          }}
          onPointerLeave={() => setTip(null)}
          onFocus={(e) => {
            setFocusId(node.id);
            if (lastPointer.current !== "touch") showTip(node, e.currentTarget);
          }}
          onBlur={() => setTip(null)}
          onClick={() => {
            setFocusId(node.id);
            onSelect(node.id);
            if (kids.length) onToggle(node.id);
            if (lastPointer.current === "touch") setTip(null);
          }}
          className={cn(
            "group my-0.5 flex cursor-pointer select-none items-center gap-1.5 rounded-xl border px-2.5 py-2 outline-none transition",
            "focus-visible:ring-2 focus-visible:ring-cyan/60",
            selected ? "border-lime/50 bg-lime/10 text-ink" : "border-transparent text-ink hover:border-line hover:bg-white/[0.04]",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-90", !kids.length && "invisible")}
          />
          <span data-label className={cn("min-w-0", depth === 0 ? "font-bold" : depth === 1 ? "font-semibold" : "font-medium", depth <= 1 ? "text-[calc(15px*var(--fs))]" : "text-[calc(14px*var(--fs))]")}>
            {node.name}
          </span>
          {kids.length > 0 && (
            <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-px text-[calc(11px*var(--fs))] font-semibold text-ink-3 tabular">{kids.length}</span>
          )}
        </div>
        {/* 좁은 화면: 들여쓰기를 거슬러 트리 전체 폭으로 (깊은 칸에서도 글이 좁아지지 않게) */}
        {selected && inlineDetail && (
          <div className="lg:hidden" style={{ marginLeft: -depth * INDENT }}>
            {inlineDetail(node)}
          </div>
        )}
        {kids.length > 0 && open && (
          <ul role="group" className="ml-[14px] border-l-2 border-white/40 pl-[10px]">
            {kids.map((c) => renderNode(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <ul role="tree" aria-label="대한민국 국가 구조" onKeyDown={onKeyDown}>
        {renderNode(root, 0)}
      </ul>
      {tip &&
        createPortal(
          <span
            id="state-tree-tip"
            role="tooltip"
            className="pointer-events-none fixed z-[100] block w-[min(300px,calc(100vw-16px))] rounded-xl border border-cyan/25 bg-canvas-2/95 p-3 text-left shadow-[0_20px_50px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl"
            style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`, animation: "feed-in 0.18s ease-out" }}
          >
            <span className="block text-[calc(13px*var(--fs))] font-semibold text-ink">{tip.node.name}</span>
            <span className="mt-1 block text-[calc(12.5px*var(--fs))] leading-relaxed text-ink-2">{tip.node.desc}</span>
            <span className="mt-1.5 block text-[calc(11px*var(--fs))] text-ink-3">근거: {tip.node.law}</span>
          </span>,
          document.body,
        )}
    </>
  );
}
