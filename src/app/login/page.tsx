"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/auth-definitions";
import { AuthShell, AuthField, AuthSubmit } from "@/components/auth/auth-shell";
import { OrDivider, SocialLogin } from "@/components/auth/social-login";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(login, undefined);
  const errors = state?.errors ?? {};

  return (
    <AuthShell
      title="로그인"
      subtitle="개인화된 정치 정보를 위해 로그인하세요."
      footer={
        <>
          계정이 없으신가요?{" "}
          <Link href="/register" className="font-semibold text-lime hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      {/* useSearchParams 를 쓰므로 Suspense 로 감쌈 */}
      <Suspense fallback={null}>
        <SocialLogin mode="login" />
      </Suspense>
      <OrDivider />
      <form action={formAction} className="space-y-4">
        <AuthField
          label="이메일"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
        />
        <AuthField
          label="비밀번호"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
        />

        {state?.message && (
          <p className="rounded-lg border border-bad/30 bg-bad/[0.07] px-3 py-2 text-xs text-bad">
            {state.message}
          </p>
        )}

        <AuthSubmit pending={pending}>로그인</AuthSubmit>
      </form>
    </AuthShell>
  );
}
