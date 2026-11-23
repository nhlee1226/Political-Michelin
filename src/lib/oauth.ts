import "server-only";

/**
 * 카카오·네이버 로그인 (OAuth 2.0 authorization code 방식)
 *
 * 흐름: /api/auth/{provider} → 제공자 로그인·동의 → /api/auth/{provider}/callback?code&state
 *       → code 로 토큰 교환 → 프로필 조회 → 우리 사용자 찾기/만들기 → pm-session 쿠키
 *
 * 환경변수 (.env.local · Vercel)
 *   KAKAO_CLIENT_ID     카카오 앱의 "REST API 키"
 *   KAKAO_CLIENT_SECRET 카카오 로그인 > 보안 > Client Secret (사용 안 함으로 두면 비워도 됨)
 *   NAVER_CLIENT_ID / NAVER_CLIENT_SECRET  네이버 애플리케이션의 Client ID / Client Secret
 *   APP_URL (선택)       redirect_uri 의 기준 주소. 없으면 요청이 들어온 주소를 씀 (예: https://political-michelin.vercel.app)
 *
 * 개발자센터에 등록할 Redirect URI: {주소}/api/auth/kakao/callback , {주소}/api/auth/naver/callback
 */

export type OAuthProvider = "kakao" | "naver";
export const OAUTH_PROVIDERS: OAuthProvider[] = ["kakao", "naver"];
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { kakao: "카카오", naver: "네이버" };

/** 로그인 시작 ~ 콜백 사이에 state 를 보관하는 쿠키 (CSRF 방지) */
export const STATE_COOKIE = "pm-oauth-state";

export interface SocialProfile {
  provider: OAuthProvider;
  providerUserId: string;
  name: string;
  email: string | null;
}

interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** 토큰 교환 때 state 도 보내야 하는가 (네이버) */
  tokenNeedsState: boolean;
  /** secret 이 꼭 있어야 하는가 (네이버는 필수, 카카오는 콘솔에서 켰을 때만) */
  secretRequired: boolean;
  profile: (accessToken: string) => Promise<Omit<SocialProfile, "provider">>;
}

const CONFIG: Record<OAuthProvider, ProviderConfig> = {
  kakao: {
    clientId: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    tokenNeedsState: false,
    secretRequired: false,
    async profile(token) {
      const res = await fetch("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`카카오 프로필 조회 실패 (${res.status})`);
      const d = (await res.json()) as {
        id: number;
        properties?: { nickname?: string };
        kakao_account?: { email?: string; is_email_verified?: boolean; profile?: { nickname?: string } };
      };
      const acc = d.kakao_account;
      return {
        providerUserId: String(d.id),
        name: acc?.profile?.nickname || d.properties?.nickname || "카카오 사용자",
        // 인증된 이메일만 (비즈 앱이 아니면 대개 없음)
        email: acc?.email && acc.is_email_verified ? acc.email : null,
      };
    },
  },
  naver: {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    tokenNeedsState: true,
    secretRequired: true,
    async profile(token) {
      const res = await fetch("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`네이버 프로필 조회 실패 (${res.status})`);
      const d = (await res.json()) as {
        resultcode: string;
        message: string;
        response?: { id: string; name?: string; nickname?: string; email?: string };
      };
      if (d.resultcode !== "00" || !d.response?.id) throw new Error(`네이버 프로필 조회 실패 (${d.message})`);
      return {
        providerUserId: d.response.id,
        name: d.response.name || d.response.nickname || "네이버 사용자",
        email: d.response.email ?? null,
      };
    },
  },
};

export const isProvider = (v: string): v is OAuthProvider => (OAUTH_PROVIDERS as string[]).includes(v);

/** 키가 설정돼 있는가 (없으면 버튼을 눌렀을 때 안내만) */
export function isConfigured(provider: OAuthProvider): boolean {
  const c = CONFIG[provider];
  return !!c.clientId && (!c.secretRequired || !!c.clientSecret);
}

/** 콜백 주소. 개발자센터에 등록한 값과 글자 하나까지 같아야 함 */
export function redirectUri(provider: OAuthProvider, requestUrl: string): string {
  const base = process.env.APP_URL?.replace(/\/+$/, "") || new URL(requestUrl).origin;
  return `${base}/api/auth/${provider}/callback`;
}

/** 제공자 로그인 화면 주소 */
export function authorizeUrl(provider: OAuthProvider, redirect: string, state: string): string {
  const c = CONFIG[provider];
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", c.clientId!);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("state", state);
  return u.toString();
}

/** code → access token → 프로필 */
export async function fetchProfile(
  provider: OAuthProvider,
  code: string,
  state: string,
  redirect: string,
): Promise<SocialProfile> {
  const c = CONFIG[provider];
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: c.clientId!, redirect_uri: redirect, code });
  if (c.clientSecret) body.set("client_secret", c.clientSecret);
  if (c.tokenNeedsState) body.set("state", state);
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    cache: "no-store",
  });
  const token = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !token.access_token) {
    throw new Error(`${PROVIDER_LABEL[provider]} 토큰 교환 실패 (${token.error_description ?? token.error ?? res.status})`);
  }
  return { provider, ...(await c.profile(token.access_token)) };
}
