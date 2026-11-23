"use client";

import { useSearchParams } from "next/navigation";

/**
 * 카카오·네이버 로그인 버튼 + 실패 안내.
 * 버튼은 일반 링크: /api/auth/{provider} 가 제공자 로그인 화면으로 보내고, 끝나면 홈으로 돌아옴.
 * 색은 각 사의 로그인 버튼 가이드 색(카카오 #FEE500, 네이버 #03C75A).
 */

const ERRORS: Record<string, string> = {
  kakao_not_configured: "카카오 로그인이 아직 설정되지 않았습니다. (KAKAO_CLIENT_ID 필요)",
  naver_not_configured: "네이버 로그인이 아직 설정되지 않았습니다. (NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 필요)",
  cancelled: "소셜 로그인을 취소했습니다.",
  state: "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.",
  failed: "소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export function SocialLogin({ mode }: { mode: "login" | "register" }) {
  const error = useSearchParams().get("error");
  const verb = mode === "login" ? "로그인" : "시작하기";
  return (
    <div className="space-y-2.5">
      {error && ERRORS[error] && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad/[0.07] px-3 py-2 text-xs text-bad">
          {ERRORS[error]}
        </p>
      )}
      <a
        href="/api/auth/kakao"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-2.5 text-sm font-semibold text-black/85 transition hover:brightness-95"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
          <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.27 4.66 6.67l-.95 3.5c-.08.3.26.54.52.37l4.17-2.76c.52.06 1.05.1 1.6.1 5.52 0 10-3.54 10-7.88S17.52 3 12 3z" />
        </svg>
        카카오로 {verb}
      </a>
      <a
        href="/api/auth/naver"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#03C75A] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
          <path d="M16.27 12.85 7.38 0H0v24h7.73V11.15L16.62 24H24V0h-7.73z" />
        </svg>
        네이버로 {verb}
      </a>
    </div>
  );
}

/** "또는" 구분선 */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[calc(11px*var(--fs))] text-ink-3">
      <span className="h-px flex-1 bg-line" />
      또는 이메일로
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
