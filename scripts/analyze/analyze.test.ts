/**
 * 편향 분석 순수 함수 테스트 (DB·네트워크·API 키 없이 실행).  실행: npm test
 * 기사 문장과 정당 이름은 지어낸 예시입니다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractBody, robotsAllows } from "./body";
import { keepGrounded, score, type Evidence } from "./score";

const ev = (direction: Evidence["direction"], strength = 2, type: Evidence["type"] = "wording"): Evidence => ({
  type,
  direction,
  strength,
  excerpt: "예시 문장",
  explanation: "예시 설명",
});

test("점수: 판단 불가면 전부 null", () => {
  assert.deepEqual(score([ev("conservative")], { assessable: false, hasBody: true }), {
    lean: null,
    bias: null,
    confidence: null,
    signals: [],
  });
});

test("점수: 근거가 없으면 중립 0, 확신 낮음", () => {
  const s = score([], { assessable: true, hasBody: true });
  assert.equal(s.lean, 0);
  assert.equal(s.bias, 0);
  assert.equal(s.confidence, "low");
});

test("점수: 진보 쪽은 음수, 보수 쪽은 양수, 크기는 같음", () => {
  const p = score([ev("progressive", 3), ev("progressive", 3)], { assessable: true, hasBody: true });
  const c = score([ev("conservative", 3), ev("conservative", 3)], { assessable: true, hasBody: true });
  assert.equal(p.lean, -67); // 100 × 6 ÷ (6 + 3)
  assert.equal(c.lean, 67);
  assert.equal(p.bias, c.bias);
});

test("점수: 약한 근거 하나로는 크게 치우치지 않음", () => {
  assert.equal(score([ev("conservative", 1)], { assessable: true, hasBody: true }).lean, 25);
});

test("점수: 양쪽 근거가 같으면 0, 중립 근거는 점수를 가운데로 당김", () => {
  assert.equal(score([ev("progressive"), ev("conservative")], { assessable: true, hasBody: true }).lean, 0);
  const alone = score([ev("conservative", 2)], { assessable: true, hasBody: true }).lean!;
  const withNeutral = score([ev("conservative", 2), ev("neutral", 3)], { assessable: true, hasBody: true }).lean!;
  assert.ok(withNeutral < alone);
});

test("확신 정도: 본문이 없으면 근거가 많아도 낮음, 있으면 근거 수에 따라", () => {
  const four = [ev("conservative"), ev("conservative"), ev("neutral"), ev("progressive")];
  assert.equal(score(four, { assessable: true, hasBody: false }).confidence, "low");
  assert.equal(score(four, { assessable: true, hasBody: true }).confidence, "high");
  assert.equal(score(four.slice(0, 2), { assessable: true, hasBody: true }).confidence, "medium");
  assert.equal(score(four.slice(0, 1), { assessable: true, hasBody: true }).confidence, "low");
});

test("배지: 방향 있는 근거의 종류만, 중복 없이", () => {
  const s = score([ev("conservative", 2, "wording"), ev("conservative", 1, "wording"), ev("neutral", 2, "quote_balance")], {
    assessable: true,
    hasBody: true,
  });
  assert.deepEqual(s.signals, ["표현"]);
});

test("근거 대조: 원문에 그대로 있는 인용만 남김 (띄어쓰기 차이는 허용)", () => {
  const text = "가나당은 이번 법안을 강하게 비판했다.\n다라당은 입장을 내지 않았다.";
  const kept = keepGrounded(
    [
      { excerpt: "가나당은 이번 법안을 강하게 비판했다." },
      { excerpt: "가나당은  이번 법안을\n강하게 비판했다." },
      { excerpt: "가나당은 이번 법안을 맹렬히 비난했다." }, // 지어낸 문장
      { excerpt: "다." }, // 너무 짧아 근거가 못 됨
    ],
    text,
  );
  assert.equal(kept.length, 2);
});

test("본문 추출: 스크립트·메뉴·저작권 줄은 버리고 문장만", () => {
  const sentence = (n: number) => `가나당 대표는 ${n}일 국회에서 기자들과 만나 이번 법안에 대한 입장을 자세히 설명했다고 밝혔다.`;
  const html = `<html><head><script>var a = "이 줄은 스크립트 안에 있어서 본문이 아니며 절대 나오면 안 됩니다.";</script></head>
    <body><ul><li>정치</li><li>경제</li></ul>
    <article><p>${sentence(1)}</p><p>${sentence(2)}</p><p>${sentence(3)}</p><p>${sentence(4)}</p>
    <p>저작권자 © 예시일보 무단 전재 및 재배포 금지. 이 줄은 본문이 아닙니다.</p></article></body></html>`;
  const body = extractBody(html)!;
  assert.ok(body.includes(sentence(1)) && body.includes(sentence(4)));
  assert.ok(!body.includes("스크립트") && !body.includes("저작권자") && !body.includes("경제"));
});

test("본문 추출: 본문 뒤 관련 기사 제목·미리보기는 버리고, 따옴표로 끝나는 인용 문장은 남김", () => {
  const p = (t: string) => `<p>${t}</p>`;
  const body = [
    "가나당 원내대표는 이날 국회에서 열린 의원총회에서 법안 처리 일정을 다시 설명했다.",
    "다라당은 법안이 충분한 논의 없이 처리됐다며 본회의 표결에 불참하기로 했다.",
    "\"헌정질서를 지키기 위해 끝까지 싸울 것이고 국민께 그 이유를 계속 설명하겠습니다\"",
    "양당은 다음 주 원내대표 회동을 열어 남은 쟁점 법안 처리 순서를 다시 협의할 예정이다.",
    "국회의장은 양당이 합의하지 못하면 다음 본회의에서 법안을 차례로 표결에 부치겠다고 밝혔다.",
  ];
  const related = [
    "철도노조 총력결의…\"인력 감축 고집하면 12월 10일 총파업\"",
    "내년부터 시행될 예정이던 가상자산 과세가 2029년으로 미뤄질 것으로 전망된다. 이 부총…",
    "영상 밥 먹고 나서 ‘이것’ 한잔 마셨을 뿐인데…“혈당 쑥 내려갔다” 연구결과 나왔다",
    "본지는 한국신문윤리위원회의 서약사로서 신문윤리강령을 준수합니다.",
    "[이 사람] 홍길동 가나당 예시시 당협위원장 “시민 신뢰부터 다시 세우겠다”",
    "예시국 “세 나라 정상, 19일 예시시에서 회담”…21세기 새 질서 열리나?",
    "‘신제품 출시’ 배우 홍길동, 피부 문제로 올해 ‘강제 휴식’…“촬영을 못 할 정도였다”",
    "상원에서는 홍길동 의원이 원내대표를 맡을 가능성이 높다. 하원에서는 김철수 가나당 ...",
    "'예시국 하원의장 유력' 홍길동 \"관세 없애고 전쟁 막겠다\"",
  ];
  const out = extractBody(`<article>${body.map(p).join("")}</article><aside>${related.map(p).join("")}</aside>`)!;
  for (const b of body) assert.ok(out.includes(b), b);
  for (const r of related) assert.ok(!out.includes(r), r);
});

test("본문 추출: <meta content> 속성값은 본문으로 읽지 않음", () => {
  const sentence = (n: number) => `가나당 대표는 ${n}일 국회에서 기자들과 만나 이번 법안에 대한 입장을 자세히 설명했다고 밝혔다.`;
  const lines = [1, 2, 3, 4].map(sentence);
  const html = `<head><meta itemprop="articleBody" content="${lines.join("")}"/></head><body><div id="articleBody">${lines.map((l) => `<p>${l}</p>`).join("")}</div></body>`;
  const out = extractBody(html)!;
  for (const l of lines) assert.equal(out.split(l).length - 1, 1, l); // 본문에 한 번씩만, meta 쪽은 없음
});

test("본문 추출: 두 번 감싼 HTML 기호(&amp;ldquo;)도 따옴표로 풂", () => {
  const line = (n: number) => `김 위원장은 ${n}일 &amp;ldquo;거주 여부와 관계없이 기본공제를 동일하게 적용해야 한다는 의견이 많다&amp;rdquo;고 말했다.`;
  const out = extractBody(`<article>${[1, 2, 3, 4].map((n) => `<p>${line(n)}</p>`).join("")}</article>`)!;
  assert.ok(out.includes("“거주 여부와 관계없이") && out.includes("의견이 많다”고 말했다."));
  assert.ok(!out.includes("&"));
});

test("본문 추출: 글이 너무 짧으면 null", () => {
  assert.equal(extractBody("<html><body><p>로그인이 필요합니다.</p></body></html>"), null);
});

test("robots.txt: Disallow 는 막고, 더 구체적인 Allow 는 통과, 다른 봇 전용 규칙은 무시", () => {
  const txt = "User-agent: OtherBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\nAllow: /private/open/\n";
  assert.equal(robotsAllows(txt, "/news/1"), true);
  assert.equal(robotsAllows(txt, "/private/1"), false);
  assert.equal(robotsAllows(txt, "/private/open/1"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\n", "/news/1"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow:\n", "/news/1"), true);
});
