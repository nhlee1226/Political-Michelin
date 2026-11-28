/**
 * 대시보드 탭 이름 — 서버 페이지(app/page.tsx 가 ?tab= 확인)와 클라이언트 헤더가 같이 씀.
 * "use client" 파일의 함수는 서버에서 부를 수 없어서 따로 둠. 탭 순서·라벨은 header.tsx 의 TABS.
 */
export const TAB_KEYS = ["map", "news", "politicians", "community", "overview"] as const;
export type TabKey = (typeof TAB_KEYS)[number];
export const isTabKey = (v: unknown): v is TabKey => (TAB_KEYS as readonly unknown[]).includes(v);
