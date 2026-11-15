import * as z from "zod";

/** 회원가입 폼 검증 */
export const SignupFormSchema = z.object({
  name: z.string().min(2, { error: "이름은 2자 이상이어야 합니다." }).trim(),
  email: z.email({ error: "올바른 이메일을 입력하세요." }).trim(),
  password: z
    .string()
    .min(8, { error: "8자 이상이어야 합니다." })
    .regex(/[a-zA-Z]/, { error: "영문자를 1개 이상 포함해야 합니다." })
    .regex(/[0-9]/, { error: "숫자를 1개 이상 포함해야 합니다." })
    .trim(),
});

/** 로그인 폼 검증 */
export const LoginFormSchema = z.object({
  email: z.email({ error: "올바른 이메일을 입력하세요." }).trim(),
  password: z.string().min(1, { error: "비밀번호를 입력하세요." }),
});

export type AuthFormState =
  | {
      errors?: Record<string, string[] | undefined>;
      message?: string;
    }
  | undefined;

/** 세션 페이로드 — 최소 정보만 (userId, role). PII 미포함. */
export interface SessionPayload {
  userId: string;
  role: string;
  expiresAt: number;
}
