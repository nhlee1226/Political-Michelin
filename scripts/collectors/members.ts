/**
 * 국회의원 300명 수집 → parties, members
 * 실행: npm run collect:members
 *
 * 응답 필드 이름(FIELD)은 첫 실행 때 Supabase 의 raw_responses 테이블에서 확인하고, 다르면 여기만 고치면 됩니다.
 */
import { env, regionLookup, saveRaw, sql, toRegionCode } from "./common";

const SERVICE = "nwvrqwxyaytdsfvhu"; // 국회의원 인적사항
const BASE = "https://open.assembly.go.kr/portal/openapi";

const FIELD = {
  monaCd: "MONA_CD",
  name: "HG_NM",
  party: "POLY_NM",
  district: "ORIG_NM", // '서울 종로구' / '비례대표'
  electType: "ELECT_GBN_NM",
  term: "REELE_GBN_NM", // 초선, 재선, 3선
  committee: "CMIT_NM",
} as const;

// 정당 색: 실제 상징색 대신 중립 팔레트를 의석 수 순서로 배정 (대시보드와 동일)
const NEUTRAL_COLORS = ["#14a894", "#8b6fe8", "#b87d0f", "#3b82c4", "#c2577a", "#6b7280"];

type Row = Record<string, string | null>;

async function fetchMembers(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const url = new URL(`${BASE}/${SERVICE}`);
    url.search = new URLSearchParams({ KEY: env("ASSEMBLY_API_KEY"), Type: "json", pIndex: String(page), pSize: "1000" }).toString();
    const body = await (await fetch(url)).json();
    if (!body[SERVICE]) {
      if (page === 1) throw new Error(JSON.stringify(body.RESULT ?? body)); // 키 오류 등
      break;
    }
    const batch: Row[] = body[SERVICE][1].row;
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

function termNumber(text: string | null): number | null {
  if (!text) return null;
  if (text.startsWith("초")) return 1;
  if (text.startsWith("재")) return 2;
  const n = parseInt(text.replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

async function main() {
  const rows = await fetchMembers();
  await saveRaw(`assembly:${SERVICE}`, { pSize: 1000 }, rows); // 아래에서 오류가 나도 원본은 남도록 먼저 저장
  const lookup = await regionLookup();

  const counts = new Map<string, number>();
  for (const r of rows) {
    const p = r[FIELD.party] || "무소속";
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const parties = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);

  await sql.begin(async (tx) => {
    for (const [i, party] of parties.entries()) {
      const color = NEUTRAL_COLORS[Math.min(i, NEUTRAL_COLORS.length - 1)];
      await tx`insert into parties (id, name, short, color) values (${party}, ${party}, ${party.slice(0, 4)}, ${color})
               on conflict (id) do update set name = excluded.name`;
    }
    for (const r of rows) {
      const elect = r[FIELD.electType];
      await tx`
        insert into members (mona_cd, name, party_id, region_code, district, elect_type, term, committee, updated_at)
        values (${r[FIELD.monaCd]}, ${r[FIELD.name]}, ${r[FIELD.party] || "무소속"},
                ${elect === "비례대표" ? null : toRegionCode(r[FIELD.district], lookup)},
                ${r[FIELD.district]}, ${elect === "지역구" || elect === "비례대표" ? elect : null},
                ${termNumber(r[FIELD.term])}, ${r[FIELD.committee]}, now())
        on conflict (mona_cd) do update set
          name = excluded.name, party_id = excluded.party_id, region_code = excluded.region_code,
          district = excluded.district, elect_type = excluded.elect_type, term = excluded.term,
          committee = excluded.committee, updated_at = now()`;
    }
  });
  console.log(`의원 ${rows.length}명, 정당 ${parties.length}개 저장 완료`);
}

main()
  .catch((e) => {
    console.error("[실패]", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
