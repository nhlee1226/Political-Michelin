import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { SessionPayload } from "./auth-definitions";

const SESSION_COOKIE = "pm-session";
const SESSION_TTL_DAYS = 7;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

// ── JWT 암호화/복호화 ───────────────────────────────────────
function getEncodedKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET 환경변수가 없습니다. .env.local 에 32바이트 이상 랜덤 문자열을 넣으세요.");
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getEncodedKey());
}

export async function decrypt(token: string | undefined = ""): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), { algorithms: ["HS256"] });
    return {
      userId: payload.userId as string,
      role: payload.role as string,
      expiresAt: payload.expiresAt as number,
    };
  } catch {
    return null;
  }
}

// ── 쿠키 세션 ───────────────────────────────────────────────
export async function createSession(userId: string, role: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = await encrypt({ userId, role, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return decrypt(token);
}

// ── 비밀번호 ────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── 사용자 조회/생성 ────────────────────────────────────────
export async function createUser({ name, email, password }: { name: string; email: string; password: string }) {
  if (!db) throw new Error("DB 가 연결되지 않았습니다. DATABASE_URL 을 확인하세요.");
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return null; // 중복 이메일
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ id, email, name, passwordHash, role: "user" })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
  return row;
}

export async function findUserByCredentials(email: string, password: string) {
  if (!db) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function findUserById(id: string) {
  if (!db) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}
