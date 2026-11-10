/**
 * 기사 속 정당·인물 언급 찾기 (DB 없이 동작하는 순수 함수)
 * 사전은 news.ts 가 DB 에서 만들어 넘김:
 *   정당 = parties (이름 + aliases)
 *   인물 = members(열린국회정보) — 연동 전에는 선관위 당선인으로 대신
 */
export interface DictEntry {
  kind: "party" | "member" | "candidate";
  ref: string;
  label: string;
  /** 본문에서 찾을 표기들 (이름, 약칭 …) */
  terms: string[];
}

export interface Mention {
  kind: DictEntry["kind"];
  ref: string;
  label: string;
}

/**
 * 동명이인처럼 같은 표기가 서로 다른 대상에 걸리면 그 표기는 쓰지 않음(잘못 연결하느니 빼는 쪽).
 * 두 글자 이하 표기도 오탐이 많아 제외.
 */
export function buildDictionary(entries: DictEntry[]): Map<string, Mention> {
  const owners = new Map<string, Mention | null>();
  for (const e of entries) {
    for (const raw of e.terms) {
      const term = raw.trim();
      if (term.length < 3) continue;
      const prev = owners.get(term);
      const me = { kind: e.kind, ref: e.ref, label: e.label };
      owners.set(term, prev === undefined || (prev && prev.kind === me.kind && prev.ref === me.ref) ? me : null);
    }
  }
  return new Map([...owners].filter((x): x is [string, Mention] => x[1] !== null));
}

export function findMentions(text: string, dict: Map<string, Mention>): Mention[] {
  const hits = new Map<string, Mention>();
  for (const [term, m] of dict) {
    if (text.includes(term)) hits.set(`${m.kind}:${m.ref}`, m);
  }
  return [...hits.values()];
}
