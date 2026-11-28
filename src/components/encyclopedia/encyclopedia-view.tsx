"use client";

/**
 * 국가 구조 백과사전 화면 (/encyclopedia)
 *  - 데스크톱(lg↑): 왼쪽 펼침 트리, 오른쪽 고정 설명 카드
 *  - 좁은 화면: 고른 칸 바로 아래에 설명 카드
 *  - ?node=<id> 로 열면 그 칸까지 펼치고 선택. 고를 때마다 주소의 ?node= 를 바꿔 공유·새로고침해도 같은 칸
 * 설계: docs/superpowers/specs/2026-11-28-state-structure-encyclopedia-design.md
 */
import * as React from "react";
import { BookOpen, MousePointerClick } from "lucide-react";
import { AS_OF, STATE_ROOT, defaultExpanded, findPath } from "@/lib/encyclopedia/state-structure";
import { DashboardHeader } from "@/components/dashboard/header";
import { Card } from "@/components/ui/primitives";
import { StateTree } from "./state-tree";
import { NodeDetail } from "./node-detail";

/** 그 칸까지의 위 칸들과 그 칸 자신을 펼친 상태 */
function expandedFor(id: string | null): Set<string> {
  const path = id ? findPath(id) : null;
  return path ? new Set(path.map((p) => p.id)) : defaultExpanded();
}

export function EncyclopediaView({ initialNodeId }: { initialNodeId: string | null }) {
  const initial = initialNodeId && findPath(initialNodeId) ? initialNodeId : null;
  const [selectedId, setSelectedId] = React.useState<string | null>(initial);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => expandedFor(initial));

  const toggle = React.useCallback((id: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const want = open ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const select = React.useCallback((id: string) => {
    const path = findPath(id);
    if (!path) return;
    setSelectedId(id);
    // 위 칸들은 펼쳐서 트리에서 보이게
    setExpanded((prev) => {
      const next = new Set(prev);
      path.slice(0, -1).forEach((p) => next.add(p.id));
      return next;
    });
    window.history.replaceState(null, "", `/encyclopedia?node=${id}`);
  }, []);

  const selected = selectedId ? findPath(selectedId)?.at(-1) : undefined;
  const detail = (node: NonNullable<typeof selected>, className?: string) => (
    <NodeDetail node={node} expanded={expanded} onSelect={select} onToggle={toggle} className={className} />
  );

  return (
    <div className="aurora min-h-dvh">
      <DashboardHeader />
      <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
        <section className="mb-5">
          <p className="flex items-center gap-1.5 text-[calc(12px*var(--fs))] font-semibold text-lime">
            <BookOpen aria-hidden className="size-4" /> 정치 백과사전
          </p>
          <h1 className="mt-1 text-[calc(28px*var(--fs))] font-bold tracking-tight">대한민국 국가 구조</h1>
          <p className="mt-2 max-w-2xl text-[calc(14.5px*var(--fs))] leading-relaxed text-ink-2">
            나라를 움직이는 기관을 가장 위에서부터 아래로 정리했습니다. 기관에 마우스를 올리면 짧은 설명이, 누르면 아래 기관과 자세한 설명이 나옵니다.
          </p>
          <p className="mt-2 text-[calc(12px*var(--fs))] text-ink-3">{AS_OF} 기준 · 근거: 법제처 국가법령정보센터의 헌법과 각 법률</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <Card className="min-w-0 p-3 sm:p-4">
            <StateTree
              root={STATE_ROOT}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={toggle}
              onSelect={select}
              inlineDetail={(node) => detail(node, "relative z-10 my-2 bg-card")}
            />
          </Card>

          <aside className="sticky top-24 hidden lg:block" aria-label="고른 기관 설명">
            {selected ? (
              detail(selected)
            ) : (
              <div className="rounded-2xl border border-dashed border-line p-5 text-[calc(14px*var(--fs))] leading-relaxed text-ink-2">
                <MousePointerClick aria-hidden className="mb-2 size-5 text-lime" />
                궁금한 기관을 눌러 보세요. 어떤 일을 하는지, 어느 법에 근거하는지, 아래에 어떤 기관이 있는지 여기에 보여 드립니다.
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
