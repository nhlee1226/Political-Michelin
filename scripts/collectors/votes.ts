/**
 * 열린국회정보 국회의원 본회의 표결정보(22대) → bill_votes  (의원 × 법안: 찬성·반대·기권·불참)
 * 실행: npm run collect:votes                 (.env.local 의 ASSEMBLY_API_KEY)
 *       npm run collect:votes -- --limit 5    # 법안 5건만 (시험용)
 *
 * 먼저 collect:members, collect:bills 를 돌려서 members·bills 가 채워져 있어야 합니다.
 * 대상: bills 중 22대이면서 본회의에서 의결된 법안(VOTED_RESULTS), 최근 발의 순.
 * 법안 1건 = API 1번(의원 300명 안팎). 다시 실행해도 같은 (법안, 의원) 줄은 덮어써서 중복되지 않습니다.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { billVotes, bills, members } from "../../src/db/schema";
import { db, env, run, saveRaw, sleep } from "./common";
import { toVoteRows, VOTE_RESULTS, VOTED_RESULTS, type VoteItem } from "./votes-parse";

const SERVICE = "nojepdqqaweusdfbi"; // 국회의원 본회의 표결정보
const BASE = "https://open.assembly.go.kr/portal/openapi";
const UNIT = 22;
const PAGE = 1000;
const WAIT_MS = 200; // API 호출 사이 대기 (과호출 방지)

/** 한 법안의 표결 줄 전부. 표결이 없는 법안은 빈 배열 (INFO-200 '해당하는 데이터가 없습니다') */
async function fetchVotes(billId: string): Promise<VoteItem[]> {
  const rows: VoteItem[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      KEY: env("ASSEMBLY_API_KEY"),
      Type: "json",
      AGE: String(UNIT),
      BILL_ID: billId,
      pIndex: String(page),
      pSize: String(PAGE),
    });
    const body = await (await fetch(`${BASE}/${SERVICE}?${q}`, { signal: AbortSignal.timeout(30_000) })).json();
    if (!body[SERVICE]) {
      if (body.RESULT?.CODE === "INFO-200") break;
      throw new Error(JSON.stringify(body.RESULT ?? body)); // 키 오류·호출 한도 등
    }
    const batch: VoteItem[] = body[SERVICE][1].row;
    rows.push(...batch);
    if (batch.length < PAGE) break;
    await sleep(WAIT_MS);
  }
  return rows;
}

/** 일시적인 네트워크 오류 대비 한 번만 다시 시도 */
async function fetchVotesRetry(billId: string): Promise<VoteItem[]> {
  try {
    return await fetchVotes(billId);
  } catch {
    await sleep(2_000);
    return fetchVotes(billId);
  }
}

/** --limit 5 / --limit=5 → 5, 없으면 null(전체) */
function limitArg(): number | null {
  const args = process.argv.slice(2);
  const i = args.findIndex((a) => a === "--limit" || a.startsWith("--limit="));
  if (i < 0) return null;
  const raw = args[i].includes("=") ? args[i].split("=")[1] : args[i + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--limit 뒤에는 1 이상의 정수를 넣으세요 (받은 값: ${raw ?? "없음"})`);
  return n;
}

run(async () => {
  const limit = limitArg();

  const known = new Set((await db.select({ monaCd: members.monaCd }).from(members)).map((m) => m.monaCd));
  if (known.size === 0) throw new Error("members 가 비어 있습니다. 먼저 npm run collect:members 를 실행하세요.");

  const query = db
    .select({ billId: bills.billId })
    .from(bills)
    .where(and(eq(bills.unit, UNIT), inArray(bills.procResult, VOTED_RESULTS)))
    .orderBy(sql`${bills.proposeDate} desc nulls last`, bills.billId)
    .$dynamic();
  const targets = await (limit ? query.limit(limit) : query);
  if (targets.length === 0) throw new Error("대상 법안이 없습니다. 먼저 npm run collect:bills 를 실행하세요.");
  console.log(`대상 법안 ${targets.length}건 (22대, ${VOTED_RESULTS.join("·")})${limit ? ` — --limit ${limit}` : ""}`);

  const tally = Object.fromEntries(VOTE_RESULTS.map((r) => [r, 0])) as Record<string, number>;
  const unknown = new Map<string, string>();
  let saved = 0;
  let withVotes = 0;
  let invalid = 0;
  let rawSaved = false;

  for (const [i, { billId }] of targets.entries()) {
    if (i > 0) await sleep(WAIT_MS);
    let items: VoteItem[];
    try {
      items = await fetchVotesRetry(billId);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new Error(`${billId} 표결 조회 실패 (${i}/${targets.length}건까지 저장됨, 다시 실행해도 안전): ${why}`);
    }
    if (items.length && !rawSaved) {
      await saveRaw("assembly:votes", { AGE: UNIT, BILL_ID: billId, sample: 3 }, items.slice(0, 3)); // 필드 확인용 샘플만
      rawSaved = true;
    }

    const r = toVoteRows(billId, items, known);
    invalid += r.invalid;
    for (const [k, v] of r.unknownMembers) unknown.set(k, v);
    if (r.rows.length) {
      await db
        .insert(billVotes)
        .values(r.rows)
        .onConflictDoUpdate({
          target: [billVotes.billId, billVotes.monaCd],
          set: { result: sql`excluded.result`, voteDate: sql`excluded.vote_date` },
        });
      withVotes++;
      saved += r.rows.length;
      for (const v of r.rows) tally[v.result]++;
    }

    const done = i + 1;
    if (targets.length <= 20 || done % 50 === 0 || done === targets.length) {
      const detail = targets.length <= 20 ? `${billId} 표결 ${r.rows.length}건` : `누적 ${saved}건`;
      console.log(`  [${done}/${targets.length}] ${detail}`);
    }
  }

  console.log(
    `표결 ${saved}건 저장 (표결 있는 법안 ${withVotes}/${targets.length}건) — ` +
      VOTE_RESULTS.map((k) => `${k} ${tally[k]}`).join(", "),
  );
  if (unknown.size) {
    const names = [...unknown].map(([cd, name]) => `${name || "?"}(${cd})`);
    console.log(`  members 에 없는 의원 ${unknown.size}명의 표는 건너뜀: ${names.slice(0, 10).join(", ")}${names.length > 10 ? " …" : ""}`);
  }
  if (invalid) console.log(`  값이 이상한 줄 ${invalid}건 건너뜀 (raw_responses 의 assembly:votes 샘플로 필드 확인)`);
});
