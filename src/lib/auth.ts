import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const cookieName = "fincoach_session";
const fallbackDevSecret = "fincoach-local-development-secret-change-before-deploy-2026";

function secret() {
  const value = process.env.AUTH_SECRET ?? (process.env.NODE_ENV !== "production" ? fallbackDevSecret : undefined);

  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must contain at least 32 characters");
    }

    console.warn("AUTH_SECRET missing, using local-development fallback. Set a secure AUTH_SECRET in .env.local for production-like environments.");
    return new TextEncoder().encode(fallbackDevSecret);
  }

  return new TextEncoder().encode(value);
}

export async function createSession(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret());
}

export async function getUserId() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: Response, token: string) {
  response.headers.append("Set-Cookie", `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}

export function clearSessionCookie(response: Response) {
  response.headers.append("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}