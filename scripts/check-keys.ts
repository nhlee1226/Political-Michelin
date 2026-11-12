/**
 * API 키·DB 연결 확인.  실행: npm run check:keys
 * .env.local: DATABASE_URL, NAVER_HUB_CLIENT_ID/SECRET, DATA_GO_KR_KEY(Decoding 키), ASSEMBLY_API_KEY(연동 예정), KOSIS_API_KEY
 * 키 값은 출력하지 않습니다.
 */
import { sql } from "drizzle-orm";
import { db, env, run } from "./collectors/common";
import { kosisGet } from "./collectors/kosis-api";
import { collectNews } from "./collectors/naver-api";

/** 키 값 모양 점검 */
function key(name: string): string {
  const v = env(name);
  const problems = [
    /[가-힣]/.test(v) && "한글이 들어 있음 (예시 글자를 지우고 실제 키를 붙여넣기)",
    /\s/.test(v) && "띄어쓰기가 들어 있음",
    /["']/.test(v) && "따옴표가 들어 있음",
    v.includes("%") && "Encoding 키로 보임 (Decoding 키를 넣기)",
  ].filter(Boolean);
  if (problems.length) throw new Error(`.env.local 의 ${name}: ${problems.join(", ")}`);
  return v;
}

async function naver() {
  key("NAVER_HUB_CLIENT_ID");
  key("NAVER_HUB_CLIENT_SECRET");
  const items = await collectNews("국회", { maxItems: 1 });
  return `"국회" 검색 ${items.length}건 응답`;
}

async function nec() {
  const q = new URLSearchParams({
    serviceKey: key("DATA_GO_KR_KEY"),
    resultType: "json",
    pageNo: "1",
    numOfRows: "1",
    sgId: "20240410",
    sgTypecode: "2",
  });
  const text = await (await fetch(`https://apis.data.go.kr/9760000/WinnerInfoInqireService2/getWinnerInfoInqire?${q}`)).text();
  let body;
  try {
    body = JSON.parse(text).response;
  } catch {
    /* 키 오류는 XML 로 올 때가 많음 */
  }
  if (!body?.header) throw new Error(`응답: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  if (body.header.resultCode !== "INFO-00") throw new Error(JSON.stringify(body.header));
  return `22대 지역구 당선인 ${body.body.totalCount}명`;
}

async function assembly() {
  if (!process.env.ASSEMBLY_API_KEY) return "키 없음 (연동 예정 — 지금은 건너뜀)";
  const code = "nzmimeepazxkubdpn"; // 의원 발의법률안
  const q = new URLSearchParams({ KEY: key("ASSEMBLY_API_KEY"), Type: "json", AGE: "22", pIndex: "1", pSize: "1" });
  const body = await (await fetch(`https://open.assembly.go.kr/portal/openapi/${code}?${q}`)).json();
  if (!body[code]) throw new Error(`${JSON.stringify(body.RESULT ?? body)} (키 글자 수 ${env("ASSEMBLY_API_KEY").length}, 보통 32)`);
  return `22대 발의 법안 ${body[code][0].head[0].list_total_count}건`;
}

async function kosis() {
  key("KOSIS_API_KEY");
  const meta = await kosisGet<{ TBL_NM: string }[]>("statisticsData.do", { method: "getMeta", type: "TBL", orgId: "101", tblId: "DT_1YL20651E" });
  return `통계표 "${meta[0]?.TBL_NM ?? "?"}" 조회`;
}

async function database() {
  const rows = await db.execute<{ t: string; n: number }>(sql`
    select 'regions' as t, count(*)::int as n from regions
    union all select 'election_candidates', count(*)::int from election_candidates
    union all select 'news_articles', count(*)::int from news_articles`);
  return rows.map((r) => `${r.t} ${r.n}행`).join(", ");
}

run(async () => {
  const checks = [
    ["DB", database],
    ["네이버 뉴스 (NAVER API HUB)", naver],
    ["선관위 (공공데이터포털)", nec],
    ["열린국회정보", assembly],
    ["KOSIS (국가통계포털)", kosis],
  ] as const;
  for (const [name, fn] of checks) {
    try {
      console.log(`[성공] ${name}: ${await fn()}`);
    } catch (e) {
      console.log(`[실패] ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
});
