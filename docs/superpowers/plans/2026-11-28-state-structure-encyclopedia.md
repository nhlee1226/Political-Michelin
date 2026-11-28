# 국가 구조 백과사전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/encyclopedia` 페이지에 대한민국 국가 구조를 위→아래 펼침 트리로 보여 주고, 칸에 마우스를 올리면 설명, 누르면 펼침·선택·근거 법을 보여 준다.

**Architecture:** 국가 구조는 정적 TS 데이터(`src/lib/encyclopedia/state-structure.ts`)와 순수 함수(경로 찾기·보이는 칸 순서)로 두고 node:test 로 검증한다. 화면은 클라이언트 컴포넌트 트리 + 설명 카드. 기존 `[[용어]]` 툴팁은 같은 데이터에서 설명을 가져온다. 헤더에는 탭 줄과 떨어진 '백과사전' 링크를 두고, 대시보드는 `?tab=`을 읽는다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, lucide-react, tsx + node:test.

**Spec:** `docs/superpowers/specs/2026-11-28-state-structure-encyclopedia-design.md`

## Global Constraints

- 기관 이름은 정부조직법(법률 제21491호, 2026-10-02 시행) 원문 기준. 기획재정부·검찰청·환경부·여성가족부·산업통상자원부·통계청·특허청·방송통신위원회는 칸 이름에 쓰지 않는다.
- 설명(`desc`)은 쉬운 말 1~3문장, 평가하는 말 없음. 칸마다 `law`(근거 조항) 필수.
- 깊이: 부·처·청·위원회, 상임위원회 각각, 법원 종류까지.
- 글자 크기는 `text-[calc(Npx*var(--fs))]` 또는 이름 있는 크기(text-sm 등)만 쓴다. 색은 `ink`/`ink-2`/`ink-3`/`lime`/`cyan` 토큰.
- 페이지 상단에 "2026년 11월 기준 · 근거: 법제처 국가법령정보센터" 표시.
- 툴팁 머리글 "AI 정치 용어 해설" → "정치 용어 해설".

## Review Focus

- 없는 `?node=` 값(예: `?node=xyz`) → 오류 없이 기본 화면(첫 층 펼침)으로 연다. (Task 1 `findPath` 테스트 + Task 3 페이지 처리)
- 글자 크기 '아주 크게' + 폭 375px → 가로 스크롤이 생기지 않고 툴팁이 화면 밖으로 나가지 않는다. (Task 3 브라우저 확인)
- 터치 화면(마우스 올리기 없음) → 누르면 펼침·선택되고 설명 카드가 보인다. 툴팁이 남아 있지 않다. (Task 3)
- 키보드만 쓰는 사람 → ↑↓로 보이는 칸 이동, →/← 펼치기·접기, 포커스하면 툴팁. (Task 1 `visibleIds` 테스트 + Task 3)
- 옛 기관 이름이 데이터에 남음 → 데이터 테스트로 막는다. (Task 1)

---

### Task 1: 국가 구조 데이터와 트리 함수

**Files:**
- Create: `src/lib/encyclopedia/state-structure.ts`
- Create: `src/lib/encyclopedia/state-structure.test.ts`
- Modify: `package.json` (`test` 스크립트에 `src/lib/**/*.test.ts` 추가)

**Interfaces:**
- Produces:
  - `type OrgNode = { id: string; name: string; desc: string; law: string; aka?: string[]; people?: "assembly-members"; children?: OrgNode[] }`
  - `const STATE_ROOT: OrgNode` (id `"korea"`, 이름 "대한민국(헌법)")
  - `const AS_OF = "2026년 11월"`
  - `findPath(id: string, root?: OrgNode): OrgNode[] | null` — 루트부터 그 칸까지
  - `allNodes(root?: OrgNode): OrgNode[]`
  - `findByTerm(term: string, root?: OrgNode): OrgNode | undefined` — `name` 또는 `aka` 일치
  - `visibleIds(root: OrgNode, expanded: ReadonlySet<string>): string[]` — 펼친 상태에서 화면에 보이는 칸 id (깊이 우선, 루트 포함)
  - `defaultExpanded(): Set<string>` — `{"korea"}`

- [ ] **Step 1: 실패하는 테스트 작성** — `state-structure.test.ts`
  - `id`가 모두 서로 다르고 `/^[a-z0-9-]+$/`.
  - 모든 칸에 `name`, `desc`(10자 이상), `law` 가 있다.
  - 첫 층 id 가 정확히 `["legislature","executive","judiciary","const-court","nec","local"]`.
  - 행정각부 칸(`ministries`)의 자식이 19개이고 이름이 정부조직법 제29조 순서와 같다(재정경제부 … 중소벤처기업부).
  - 이름에 `기획재정부|검찰청|^환경부$|여성가족부|산업통상자원부|통계청|특허청|방송통신위원회` 가 없다.
  - `findPath("pm")` 이름들 = `["대한민국(헌법)","행정부","국무총리"]`; `findPath("xyz") === null`.
  - `findByTerm("상임위원회")?.id === "standing-committees"`.
  - `visibleIds(STATE_ROOT, new Set(["korea"]))` = `["korea", ...첫 층 6개]`; `"executive"` 를 더 펼치면 `executive` 바로 뒤에 `president`, `pm` 이 온다.
- [ ] **Step 2:** `npx tsx --test src/lib/encyclopedia/state-structure.test.ts` → 모듈 없음으로 FAIL.
- [ ] **Step 3:** 데이터와 함수 구현. 트리 갈래는 스펙의 "트리 내용"과 아래 확인된 목록을 따른다.
  - 대통령: 대통령비서실(정부조직법 제14조), 국가안보실(제15조), 대통령경호처(제16조), 국가정보원(제17조), 감사원(헌법 제97조), 국무회의(헌법 제88조), 방송미디어통신위원회(정부조직법 제2조).
  - 국무총리: 국무조정실(제20조), 국무총리비서실(제21조), 처 = 기획예산처(제23조)·인사혁신처(제24조)·법제처(제25조)·식품의약품안전처(제26조)·국가데이터처(제27조)·지식재산처(제28조), 위원회 = 공정거래위원회·국민권익위원회·금융위원회·개인정보 보호위원회·원자력안전위원회(정부조직법 제2조), 행정각부(제29조).
  - 각 부 아래 청: 재정경제부—국세청·관세청·조달청(제30조), 외교부—재외동포청(제33조), 법무부—공소청(제35조), 국방부—병무청·방위사업청(제36조), 행정안전부—경찰청·소방청·중대범죄수사청(제37조), 문화체육관광부—국가유산청(제39조), 농림축산식품부—농촌진흥청·산림청(제40조), 보건복지부—질병관리청(제42조), 기후에너지환경부—기상청(제43조), 해양수산부—해양경찰청(제47조), 과학기술정보통신부—우주항공청, 국토교통부—행정중심복합도시건설청·새만금개발청(정부조직법 제2조).
  - 국회 상임위원회 17개: 국회운영 · 법제사법 · 정무 · 재정경제기획 · 과학기술정보방송통신 · 교육 · 문화체육관광 · 외교통일 · 국방 · 행정안전 · 농림축산식품해양수산 · 산업통상자원중소벤처기업 · 보건복지 · 기후에너지환경노동 · 국토교통 · 정보 · 성평등가족 (국회법 제37조, 위키백과 2026-06 기준 — Task 5 검수 표에서 "원문 미확인" 표시). 국회의원 칸에 `people: "assembly-members"`.
  - 법원: 대법원·고등법원·특허법원·지방법원·가정법원·행정법원·회생법원(법원조직법 제3조).
- [ ] **Step 4:** 같은 명령 → PASS. `npm test` 전체 PASS.
- [ ] **Step 5: Commit** — `feat: 국가 구조 백과사전 데이터와 트리 함수`

### Task 2: 용어 툴팁을 백과사전 데이터와 합치기

**Files:**
- Create: `src/lib/glossary.ts`, `src/lib/glossary.test.ts`
- Modify: `src/components/dashboard/glossary-text.tsx`

**Interfaces:**
- Consumes: `findByTerm` (Task 1)
- Produces: `glossaryEntry(term: string): { desc: string; nodeId?: string } | undefined`

- [ ] **Step 1: 실패하는 테스트** — `glossaryEntry("상임위원회")` 의 `nodeId === "standing-committees"` 이고 `desc` 가 트리 칸 `desc` 와 같다; `glossaryEntry("필리버스터")` 는 `nodeId` 없이 기존 `GLOSSARY` 설명; `glossaryEntry("없는말") === undefined`.
- [ ] **Step 2:** `npx tsx --test src/lib/glossary.test.ts` → FAIL.
- [ ] **Step 3:** 구현 — 트리에서 먼저 찾고, 없으면 `GLOSSARY`(mock-data). `glossary-text.tsx` 는 `glossaryEntry` 사용, 머리글 "정치 용어 해설", `nodeId` 가 있으면 용어를 누를 때 `/encyclopedia?node=<id>` 로 이동하고 툴팁 끝에 "누르면 백과사전에서 자세히" 한 줄.
- [ ] **Step 4:** 테스트 PASS, `npm run typecheck` 통과.
- [ ] **Step 5: Commit** — `feat: 용어 툴팁이 백과사전 설명을 쓰고 백과사전으로 연결`

### Task 3: 백과사전 페이지와 펼침 트리

**Files:**
- Create: `src/app/encyclopedia/page.tsx` (서버, `searchParams: Promise<{ node?: string }>`, metadata 제목 "국가 구조 백과사전 | 정치 미슐랭")
- Create: `src/components/encyclopedia/encyclopedia-view.tsx` (클라이언트: 헤더 + 기준일 + 트리 + 설명 카드, 선택·펼침 상태, 주소 `?node=` 동기화는 `history.replaceState`)
- Create: `src/components/encyclopedia/state-tree.tsx` (`role="tree"`, 키보드, 연결선, 마우스 올리기 툴팁)
- Create: `src/components/encyclopedia/node-detail.tsx` (이름·경로·뜻·근거 법·"아래 기관 N개 펼치기")

**Interfaces:**
- Consumes: `STATE_ROOT`, `AS_OF`, `findPath`, `visibleIds`, `defaultExpanded` (Task 1); `DashboardHeader` (Task 4 에서 탭 없는 모드 추가 — Task 3 에서는 임시로 로고 링크만 둬도 됨)
- Produces: `EncyclopediaView({ initialNodeId }: { initialNodeId: string | null })`

- [ ] **Step 1:** 페이지 구현. 처음 상태: `initialNodeId` 의 경로가 있으면 경로 전체 펼침 + 선택, 없으면 `defaultExpanded()` 에 선택 없음.
- [ ] **Step 2:** 트리 동작: 칸 누르기 = 자식 있으면 펼침/접기 토글 + 선택. 마우스 올리기·포커스 = 칸 옆 툴팁(이름 + `desc`, `glossary-text.tsx` 와 같은 포털 방식, 화면 안에 고정). 터치(`pointerType === "touch"`)에서는 툴팁을 띄우지 않는다. ↑↓ 이동(`visibleIds` 순서), → 펼치기, ← 접기/부모로, Enter 선택.
- [ ] **Step 3:** 배치: `lg` 이상 2단(트리 / 오른쪽 sticky 설명 카드), 그보다 좁으면 선택한 칸 바로 아래에 설명 카드.
- [ ] **Step 4: 브라우저 확인** — `/encyclopedia`, `/encyclopedia?node=pm`, `/encyclopedia?node=xyz` 가 오류 없이 열림; 툴팁 표시; 375px + 글자 '아주 크게'에서 가로 스크롤 없음(`document.documentElement.scrollWidth <= innerWidth`); 콘솔·서버 오류 없음.
- [ ] **Step 5: Commit** — `feat: 국가 구조 백과사전 페이지`

### Task 4: 헤더의 독립 '백과사전' 버튼과 탭 주소

**Files:**
- Modify: `src/components/dashboard/header.tsx` — 탭 줄 오른쪽에 구분선 + `<Link href="/encyclopedia">` '백과사전'(BookOpen 아이콘). props `tab`/`onTabChange` 를 선택으로 바꾸고, 없으면(백과사전 페이지) 탭을 눌렀을 때 `/?tab=<key>` 로 이동하며 '백과사전' 버튼이 선택된 모양.
- Modify: `src/app/page.tsx` — `searchParams: Promise<{ tab?: string }>` 를 읽어 `initialTab` 전달 (TabKey 가 아니면 무시).
- Modify: `src/components/dashboard/political-michelin-dashboard.tsx` — `initialTab?: TabKey` 로 첫 탭 설정.
- Modify: `src/components/encyclopedia/encyclopedia-view.tsx` — `DashboardHeader` 를 탭 없는 모드로 사용.

**Interfaces:**
- Produces: `DashboardHeader({ tab?, onTabChange?, onSearch? })`, `isTabKey(v: unknown): v is TabKey` (header.tsx)

- [ ] **Step 1:** 구현.
- [ ] **Step 2: 브라우저 확인** — 대시보드에서 '백과사전' 누르면 `/encyclopedia`; 백과사전에서 '뉴스·이슈' 누르면 `/?tab=news` 에서 뉴스 탭; `/?tab=zzz` 는 지도 탭. `npm run typecheck` 통과.
- [ ] **Step 3: Commit** — `feat: 상단에 독립 백과사전 버튼, 탭 주소 지원`

### Task 5: 내용 검수 표

**Files:**
- Create: `scripts/encyclopedia-review.ts` (+ `package.json` 의 `encyclopedia:review`) — `allNodes()` 를 경로·이름·뜻·근거 법 표로 `docs/encyclopedia-review.md` 에 쓴다. 상임위원회 칸에는 "국회법 원문 미확인(위키백과 2026-06 기준)" 표시.

- [ ] **Step 1:** 스크립트 작성·실행 → 표 파일 생성(칸 수 출력).
- [ ] **Step 2:** 사용자에게 표를 보여 주고 확인받는다.
- [ ] **Step 3: Commit** — `docs: 백과사전 내용 검수 표`
