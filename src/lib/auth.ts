import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userIdentities, users } from "@/db/schema";
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
  // 소셜로만 가입한 계정은 비밀번호가 없음
  if (!row?.passwordHash) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** provider: 어떻게 가입한 계정인지 (email | kakao | naver). 화면에 이메일 대신 "카카오 로그인" 등으로 표시할 때 씀 */
export async function findUserById(id: string) {
  if (!db) return null;
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      provider: sql<"email" | "kakao" | "naver">`coalesce(
        (select ${userIdentities.provider} from ${userIdentities}
          where ${userIdentities.userId} = ${users.id} order by ${userIdentities.createdAt} limit 1),
        'email')`,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

// ── 소셜 로그인 (카카오·네이버) ─────────────────────────────
/**
 * 제공자 계정으로 사용자를 찾고, 처음이면 새 계정을 만들어 연결.
 * 같은 이메일의 기존 계정과 자동으로 합치지 않음 (남의 이메일로 계정을 가로채는 것을 막기 위해).
 */
export async function findOrCreateSocialUser(profile: {
  provider: "kakao" | "naver";
  providerUserId: string;
  name: string;
  email: string | null;
}) {
  const conn = db;
  if (!conn) throw new Error("DB 가 연결되지 않았습니다. DATABASE_URL 을 확인하세요.");
  const findLinked = async () => {
    const [row] = await conn
      .select({ id: users.id, role: users.role })
      .from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.userId))
      .where(and(eq(userIdentities.provider, profile.provider), eq(userIdentities.providerUserId, profile.providerUserId)))
      .limit(1);
    return row ?? null;
  };
  const linked = await findLinked();
  if (linked) return linked;

  try {
    return await conn.transaction(async (tx) => {
      const id = randomUUID();
      const [user] = await tx
        .insert(users)
        .values({ id, name: profile.name, email: null, passwordHash: null, role: "user" })
        .returning({ id: users.id, role: users.role });
      await tx
        .insert(userIdentities)
        .values({ provider: profile.provider, providerUserId: profile.providerUserId, userId: id, email: profile.email });
      return user;
    });
  } catch (e) {
    // 같은 계정으로 거의 동시에 두 번 로그인해 먼저 연결된 경우(기본키 충돌): 그 사용자를 씀
    const again = await findLinked();
    if (again) return again;
    throw e;
  }
}
