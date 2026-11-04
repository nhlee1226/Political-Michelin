/**
 * API 키·데이터 출처 연결 확인.  실행: npm run check:keys
 * .env.local 에 DATABASE_URL, ASSEMBLY_API_KEY, DATA_GO_KR_KEY(Decoding 키) 필요. 뉴스(언론사 RSS)는 키 없음
 */
import { env, sql } from "./collectors/common";
import { FEEDS } from "./collectors/feeds";
import { fetchFeed } from "./collectors/news";

/** 키 값 모양 점검 (값은 출력하지 않음) */
function key(name: string): string {
  const v = env(name).trim();
  const problems = [
    /[\uAC00-\uD7A3]/.test(v) && "한글이 들어 있음 (예시 글자를 지우고 실제 키를 붙여넣기)",
    /\s/.test(v) && "띄어쓰기가 들어 있음",
    /["']/.test(v) && "따옴표가 들어 있음",
    v.includes("%") && "Encoding 키로 보임 (Decoding 키를 넣기)",
  ].filter(Boolean);
  if (problems.length) throw new Error(`.env.local 의 ${name}: ${problems.join(", ")}`);
  return v;
}

async function assembly() {
  const code = "nzmimeepazxkubdpn"; // 의원 발의법률안
  const q = new URLSearchParams({ KEY: key("ASSEMBLY_API_KEY"), Type: "json", AGE: "22", pIndex: "1", pSize: "1" });
  const body = await (await fetch(`https://open.assembly.go.kr/portal/openapi/${code}?${q}`)).json();
  if (!body[code]) throw new Error(`${JSON.stringify(body.RESULT ?? body)} (넣은 키 글자 수 ${env("ASSEMBLY_API_KEY").trim().length}, 보통 32)`);
  return `22대 발의 법안 ${body[code][0].head[0].list_total_count}건`;
}

async function nec() {
  const q = new URLSearchParams({
    serviceKey: key("DATA_GO_KR_KEY"), resultType: "json", pageNo: "1", numOfRows: "1", sgId: "20240410", sgTypecode: "2",
  });
  const text = await (await fetch(`https://apis.data.go.kr/9760000/WinnerInfoInqireService2/getWinnerInfoInqire?${q}`)).text();
  let body;
  try { body = JSON.parse(text).response; } catch { /* 키 오류는 XML 로 올 때가 많음 */ }
  if (!body?.header) throw new Error(`응답: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  if (body.header.resultCode !== "INFO-00") throw new Error(JSON.stringify(body.header));
  return `22대 지역구 당선인 ${body.body.totalCount}명`;
}

async function rss() {
  const r = await Promise.allSettled(FEEDS.map(fetchFeed));
  const ok = FEEDS.filter((_, i) => r[i].status === "fulfilled").map((f) => f.outlet);
  const bad = FEEDS.filter((_, i) => r[i].status === "rejected").map((f) => f.outlet);
  if (ok.length === 0) throw new Error("모든 피드 실패 (인터넷 연결 확인)");
  return `피드 ${ok.length}/${FEEDS.length}개 응답${bad.length ? ` (안 됨: ${bad.join(", ")})` : ""}`;
}

async function db() {
  const [r] = await sql`select count(*)::int as n from regions`;
  return `regions 테이블 ${r.n}행`;
}

async function main() {
  for (const [name, fn] of [["열린국회정보", assembly], ["공공데이터포털(선관위)", nec], ["언론사 RSS 뉴스", rss], ["Supabase DB", db]] as const) {
    try {
      console.log(`[성공] ${name}: ${await fn()}`);
    } catch (e) {
      console.log(`[실패] ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await sql.end();
}

main();
