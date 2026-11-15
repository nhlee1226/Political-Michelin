"use server";

import { redirect } from "next/navigation";
import { SignupFormSchema, LoginFormSchema, type AuthFormState } from "@/lib/auth-definitions";
import { createUser, findUserByCredentials, createSession, deleteSession } from "@/lib/auth";

/** 회원가입: 검증 → 사용자 생성 → 세션 → 홈으로 */
export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validated = SignupFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const { name, email, password } = validated.data;
  const user = await createUser({ name, email, password });
  if (!user) {
    return { message: "이미 가입된 이메일입니다." };
  }
  await createSession(user.id, user.role);
  redirect("/");
}

/** 로그인: 검증 → 자격증명 확인 → 세션 → 홈으로 */
export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const validated = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const { email, password } = validated.data;
  const user = await findUserByCredentials(email, password);
  if (!user) {
    return { message: "이메일 또는 비밀번호가 일치하지 않습니다." };
  }
  await createSession(user.id, user.role);
  redirect("/");
}

/** 로그아웃: 세션 삭제 → 로그인 페이지로 */
export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
