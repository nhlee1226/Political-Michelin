import * as React from "react";

/**
 * 한쪽 눈 로고 아이콘 (정치 미슐랭 로고의 별을 대신함).
 * 아몬드 모양 눈 + 홍채 자리를 뚫어 배경색이 비치고, 가운데 동공과 작은 반사광.
 * 색은 currentColor 를 따름 → 로고에서는 text-canvas (라임 배경 위 검은 눈).
 */
export function OneEye({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} {...props}>
      {/* 눈 흰자 자리(아몬드) — 홍채 원을 evenodd 로 뚫음 */}
      <path
        fillRule="evenodd"
        d="M12 5C6.6 5 2.9 8.9 1.2 12c1.7 3.1 5.4 7 10.8 7s9.1-3.9 10.8-7C21.1 8.9 17.4 5 12 5Zm0 2.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z"
      />
      {/* 동공 — 오른쪽 위 반사광을 뚫음 */}
      <path fillRule="evenodd" d="M12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4Zm1.1.9a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  );
}
