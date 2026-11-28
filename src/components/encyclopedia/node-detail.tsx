"use client";

/**
 * 고른 기관의 설명 카드 — 이름, 위치(대한민국 › 행정부 › …), 뜻, 근거 법, 아래 기관.
 * 데스크톱은 트리 오른쪽에 고정, 좁은 화면은 고른 칸 바로 아래에 들어감 (encyclopedia-view.tsx)
 */
import * as React from "react";
import Link from "next/link";
import { ChevronRight, Scale, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { findPath, type OrgNode } from "@/lib/encyclopedia/state-structure";

export function NodeDetail({
  node,
  expanded,
  onSelect,
  onToggle,
  className,
}: {
  node: OrgNode;
  expanded: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string, open?: boolean) => void;
  className?: string;
}) {
  const path = findPath(node.id) ?? [node];
  const kids = node.children ?? [];
  const open = expanded.has(node.id);
  return (
    <div className={cn("rounded-2xl border border-line bg-white/[0.03] p-4", className)}>
      <nav aria-label="위치" className="flex flex-wrap items-center gap-0.5 text-[calc(12px*var(--fs))] text-ink-3">
        {path.slice(0, -1).map((p) => (
          <React.Fragment key={p.id}>
            <button type="button" onClick={() => onSelect(p.id)} className="rounded px-0.5 hover:text-ink hover:underline">
              {p.name}
            </button>
            <ChevronRight aria-hidden className="size-3" />
          </React.Fragment>
        ))}
      </nav>
      <h2 className="mt-1 text-[calc(20px*var(--fs))] font-bold tracking-tight">{node.name}</h2>
      <p className="mt-2 text-[calc(14.5px*var(--fs))] leading-relaxed text-ink">{node.desc}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[calc(12px*var(--fs))] text-ink-2">
        <Scale aria-hidden className="size-3.5" /> 근거: {node.law}
      </p>

      {node.people === "assembly-members" && (
        <Link
          href="/?tab=politicians"
          className="mt-3 flex items-center gap-1.5 text-[calc(13px*var(--fs))] font-semibold text-lime hover:underline"
        >
          <Users aria-hidden className="size-4" /> 지금 국회의원 목록 보기
        </Link>
      )}

      {kids.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[calc(13px*var(--fs))] font-semibold">아래 기관 {kids.length}개</p>
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="rounded-full border border-line px-2.5 py-1 text-[calc(12px*var(--fs))] text-ink-2 hover:border-white/20 hover:text-ink"
            >
              {open ? "트리에서 접기" : "트리에서 펼치기"}
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {kids.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onToggle(node.id, true);
                    onSelect(c.id);
                  }}
                  className="rounded-lg border border-line bg-white/[0.03] px-2 py-1 text-[calc(12.5px*var(--fs))] text-ink hover:border-lime/40 hover:bg-lime/10"
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
