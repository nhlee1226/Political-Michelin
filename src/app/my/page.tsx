import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, ExternalLink, MapPin, Newspaper, Star } from "lucide-react";
import { verifySession, getCurrentUser } from "@/lib/dal";
import { accountLabel } from "@/lib/auth-definitions";
import { getUserItems } from "@/lib/user-data";
import { getNewsByIds, getMembersByIds } from "@/db/queries";
import { REGIONS } from "@/lib/mock-data";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  // 보호 라우트 — 비로그인은 proxy 가 /login 로 보냄
  await verifySession();
  const user = await getCurrentUser();
  const items = (await getUserItems()) ?? { regions: [], politicians: [], news: [] };

  const [savedNews, favPoliticians] = await Promise.all([
    getNewsByIds(items.news),
    getMembersByIds(items.politicians),
  ]);
  const followedRegions = REGIONS.filter((r) => items.regions.includes(r.code));
  const stripTerms = (s: string) => s.replace(/\[\[(.+?)\]\]/g, "$1");

  return (
    <main className="aurora min-h-svh">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="grid size-9 place-items-center rounded-full border border-line bg-white/[0.03] text-ink-2 transition hover:border-white/20 hover:text-ink"
              aria-label="홈으로"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">내 활동</h1>
              <p className="text-xs text-ink-3">{user ? accountLabel(user) : null}</p>
            </div>
          </div>
          <Badge tone="lime">{user?.role === "admin" ? "관리자" : "회원"}</Badge>
        </div>

        <div className="space-y-4">
          {/* 관심 지역 */}
          <Card>
            <CardHeader
              title="관심 지역"
              subtitle={`${followedRegions.length}곳`}
              icon={<MapPin className="size-4" />}
            />
            <div className="p-5 pt-3">
              {followedRegions.length === 0 ? (
                <EmptyState icon={<MapPin className="size-5" />} text="관심 지역을 추가해 보세요." />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {followedRegions.map((r) => (
                    <Link
                      key={r.code}
                      href="/"
                      className="flex items-center gap-1.5 rounded-full border border-lime/25 bg-lime/[0.07] px-3 py-1.5 text-xs font-medium text-lime transition hover:bg-lime/[0.12]"
                    >
                      <MapPin className="size-3" />
                      {r.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* 즐겨찾는 정치인 */}
          <Card>
            <CardHeader
              title="즐겨찾는 정치인"
              subtitle={`${favPoliticians.length}명`}
              icon={<Star className="size-4" />}
            />
            <div className="p-5 pt-3">
              {favPoliticians.length === 0 ? (
                <EmptyState icon={<Star className="size-5" />} text="별표한 정치인이 없습니다." />
              ) : (
                <ul className="space-y-2">
                  {favPoliticians.map((p) => (
                    <li key={p.id}>
                      <div className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] p-3">
                        <span
                          className="grid size-9 shrink-0 place-items-center rounded-full border-2 text-[11px] font-semibold"
                          style={{ borderColor: p.partyColor, background: `${p.partyColor}22` }}
                        >
                          {p.name.slice(-2)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                            {p.name}
                            {/* 별점 데이터는 /api/politicians 에 있어 여기선 생략 */}
                          </p>
                          <p className="truncate text-[11px] text-ink-3">
                            {p.partyName ?? "—"} · {p.district ?? "—"}
                          </p>
                        </div>
                        <Badge tone="neutral" className="tabular">
                          발의 {p.billsProposed ?? 0}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* 저장한 뉴스 */}
          <Card>
            <CardHeader
              title="저장한 뉴스"
              subtitle={`${savedNews.length}건`}
              icon={<Bookmark className="size-4" />}
            />
            <div className="p-5 pt-3">
              {savedNews.length === 0 ? (
                <EmptyState icon={<Newspaper className="size-5" />} text="저장한 기사가 없습니다." />
              ) : (
                <ul className="space-y-2">
                  {savedNews.map((n) => (
                    <li key={n.id}>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-3 rounded-xl border border-line bg-white/[0.03] p-3 transition hover:border-white/15"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-ink-3">
                            {n.source} · {n.time} · {n.category}
                          </p>
                          <p className="mt-0.5 text-[13px] leading-snug">
                            {stripTerms(n.objectiveHeadline ?? n.headline)}
                          </p>
                        </div>
                        <ExternalLink className="size-3.5 shrink-0 text-ink-3 transition group-hover:text-ink" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <p className="mt-6 text-center text-[11px] text-ink-3">
          북마크·관심 지역·즐겨찾기는 계정에 저장되어 어느 기기에서나 같이 보입니다.
        </p>
      </div>
    </main>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-3 py-6 text-center">
      <span className="text-ink-3">{icon}</span>
      <p className="text-xs text-ink-3">{text}</p>
      <Link href="/" className="text-[11px] font-semibold text-lime hover:underline">
        대시보드에서 추가하기
      </Link>
    </div>
  );
}
