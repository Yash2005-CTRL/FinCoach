import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const [rows] = await db.query("SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1", [email]);
    const user = Array.isArray(rows) ? rows[0] as { id: string; name: string; email: string; password_hash: string | null } | undefined : undefined;
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
    setSessionCookie(response, await createSession(user.id));
    return response;
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to sign in" }, { status: 500 });
  }
}