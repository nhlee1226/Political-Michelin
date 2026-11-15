"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/auth-definitions";
import { AuthShell, AuthField, AuthSubmit } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signup, undefined);
  const errors = state?.errors ?? {};

  return (
    <AuthShell
      title="회원가입"
      subtitle="이메일과 비밀번호로 계정을 만드세요."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-semibold text-lime hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <form action={formAction} className="space-y-4">
        <AuthField
          label="이름"
          name="name"
          autoComplete="name"
          placeholder="홍길동"
          error={errors.name}
        />
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
          autoComplete="new-password"
          placeholder="영문+숫자 8자 이상"
          error={errors.password}
        />

        {state?.message && (
          <p className="rounded-lg border border-bad/30 bg-bad/[0.07] px-3 py-2 text-xs text-bad">
            {state.message}
          </p>
        )}

        <AuthSubmit pending={pending}>가입하기</AuthSubmit>
      </form>
    </AuthShell>
  );
}
