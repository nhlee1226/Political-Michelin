/**
 * 선관위(공공데이터포털 9760000) API 호출 공통 함수 — collect:local 이 씀.
 * collect:nec(nec.ts)에도 같은 fetchAll 이 들어 있음. 22대 총선 수집 코드는 그대로 두려고 옮기지 않았으니,
 * 나중에 nec.ts 를 고칠 일이 생기면 이 파일의 fetchAll 을 import 하도록 바꾸면 됩니다.
 */
import { env, sleep } from "./common";
import type { Item } from "./nec-parse";

export const NEC_BASE = "https://apis.data.go.kr/9760000";
export const NEC_API = {
  sgCodes: "CommonCodeService/getCommonSgCodeList", // 선거 코드 목록 (sgId·sgTypecode·sgName·sgVotedate)
  winners: "WinnerInfoInqireService2/getWinnerInfoInqire",
};

/** 공공데이터포털 목록 API 를 끝까지 읽음 (한 번에 100줄까지만 와도 totalCount 까지 페이지를 넘김) */
export async function fetchAll(path: string, params: Record<string, string>): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      serviceKey: env("DATA_GO_KR_KEY"),
      resultType: "json",
      pageNo: String(page),
      numOfRows: "500",
      ...params,
    });
    const text = await (await fetch(`${NEC_BASE}/${path}?${q}`, { signal: AbortSignal.timeout(30_000) })).text();
    let res;
    try {
      res = JSON.parse(text).response;
    } catch {
      /* 키 오류는 XML 로 옴 */
    }
    if (!res?.header) throw new Error(`${path} 응답: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    if (res.header.resultCode !== "INFO-00") {
      if (res.header.resultCode === "INFO-03") break; // 데이터 없음
      throw new Error(`${path}: ${JSON.stringify(res.header)}`);
    }
    const raw = res.body?.items?.item ?? [];
    const batch: Item[] = Array.isArray(raw) ? raw : [raw];
    items.push(...batch);
    if (batch.length === 0 || items.length >= Number(res.body.totalCount ?? 0)) break;
    await sleep(100);
  }
  return items;
}
