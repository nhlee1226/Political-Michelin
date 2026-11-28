/**
 * [연동 예정] 열린국회정보 국회의원 인적사항 → parties(source='assembly'), members
 * 실행: npm run collect:members      (.env.local 의 ASSEMBLY_API_KEY)
 * 같은 응답의 연락처·약력(전화·이메일·홈페이지·의원회관 호실·보좌진·약력 등)도 저장합니다 → 정치인 상세 페이지.
 * 그 열이 없으면 시작할 때 scripts/sql/add-politician-detail.sql 로 만듭니다 (db:push 필요 없음).
 *
 * 아직 실제 키로 검증하지 않은 초안입니다. 첫 실행 뒤 raw_responses 의 assembly:members 원본에서
 * 필드 이름을 확인하고, 다르면 FIELD 만 고치면 됩니다. 검증 후 .github/workflows/collect.yml 에 추가하세요.
 */
import { sql } from "drizzle-orm";
import { members, parties } from "../../src/db/schema";
import { apiFetch } from "./api-fetch";
import { db, env, regionLookup, run, saveRaw, toRegionCode } from "./common";
import { memberPhotoUrl, memberProfile } from "./member-detail-parse";
import { assignColors } from "./nec-parse";
import { applySqlFile } from "./sql-file";

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

type Row = Record<string, string | null>;

async function fetchMembers(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ KEY: env("ASSEMBLY_API_KEY"), Type: "json", pIndex: String(page), pSize: "1000" });
    const body = await (await apiFetch("assembly", `${BASE}/${SERVICE}?${q}`, { signal: AbortSignal.timeout(30_000) })).json();
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

run(async () => {
  await applySqlFile(db, "add-politician-detail.sql"); // 연락처·약력 열이 없으면 만듦
  const rows = await fetchMembers();
  await saveRaw("assembly:members", { pSize: 1000 }, rows); // 아래에서 오류가 나도 원본은 남도록 먼저 저장
  const lookup = await regionLookup();

  const seats = new Map<string, number>();
  for (const r of rows) {
    const p = r[FIELD.party] || "무소속";
    seats.set(p, (seats.get(p) ?? 0) + 1);
  }
  const ordered = [...seats.keys()].sort((a, b) => seats.get(b)! - seats.get(a)! || a.localeCompare(b, "ko"));
  const colors = assignColors(ordered);

  await db.transaction(async (tx) => {
    // 정당 기준 출처는 열린국회정보 → 이름·색을 여기 기준으로 덮어씀
    await tx
      .insert(parties)
      .values(
        ordered.map((name) => ({
          id: name,
          name,
          short: name.length > 5 ? name.slice(0, 5) : name,
          color: colors.get(name)!,
          source: "assembly",
        })),
      )
      .onConflictDoUpdate({
        target: parties.id,
        set: { name: sql`excluded.name`, color: sql`excluded.color`, source: sql`excluded.source`, updatedAt: sql`now()` },
      });

    const values = rows
      .filter((r) => r[FIELD.monaCd] && r[FIELD.name])
      .map((r) => {
        const elect = r[FIELD.electType];
        return {
          monaCd: r[FIELD.monaCd]!,
          name: r[FIELD.name]!,
          partyId: r[FIELD.party] || "무소속",
          regionCode: elect === "비례대표" ? null : toRegionCode(r[FIELD.district], lookup),
          district: r[FIELD.district],
          electType: elect === "지역구" || elect === "비례대표" ? elect : null,
          term: termNumber(r[FIELD.term]),
          committee: r[FIELD.committee],
          photoUrl: memberPhotoUrl(r[FIELD.monaCd]), // 국회 공식 사진 (이 API 에는 사진 칸이 없어 코드로 만듦)
          ...memberProfile(r),
        };
      });
    await tx
      .insert(members)
      .values(values)
      .onConflictDoUpdate({
        target: members.monaCd,
        set: {
          name: sql`excluded.name`,
          partyId: sql`excluded.party_id`,
          regionCode: sql`excluded.region_code`,
          district: sql`excluded.district`,
          electType: sql`excluded.elect_type`,
          term: sql`excluded.term`,
          committee: sql`excluded.committee`,
          photoUrl: sql`excluded.photo_url`,
          hanjaName: sql`excluded.hanja_name`,
          engName: sql`excluded.eng_name`,
          birthDate: sql`excluded.birth_date`,
          gender: sql`excluded.gender`,
          jobTitle: sql`excluded.job_title`,
          committees: sql`excluded.committees`,
          units: sql`excluded.units`,
          tel: sql`excluded.tel`,
          email: sql`excluded.email`,
          homepage: sql`excluded.homepage`,
          office: sql`excluded.office`,
          staff: sql`excluded.staff`,
          secretary: sql`excluded.secretary`,
          secretary2: sql`excluded.secretary2`,
          career: sql`excluded.career`,
          updatedAt: sql`now()`,
        },
      });
  });
  const contacts = rows.filter((r) => memberProfile(r).tel || memberProfile(r).email).length;
  console.log(`의원 ${rows.length}명, 정당 ${ordered.length}개 저장 완료 (연락처 있는 의원 ${contacts}명)`);
  if (rows.length > 0 && contacts === 0) {
    console.log("[확인] 연락처가 하나도 없어요. raw_responses 의 assembly:members 원본에서 TEL_NO·E_MAIL 필드 이름을 확인하세요 (member-detail-parse.ts 의 PROFILE_FIELD).");
  }
});
