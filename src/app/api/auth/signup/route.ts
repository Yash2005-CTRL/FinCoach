import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return NextResponse.json({ error: "Name, valid email, and an 8-character password are required" }, { status: 400 });
    }
    const [existing] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (Array.isArray(existing) && existing.length > 0) return NextResponse.json({ error: "An account already exists for this email" }, { status: 409 });
    const id = randomUUID();
    await db.query("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)", [id, name, email, await bcrypt.hash(password, 12)]);
    const response = NextResponse.json({ user: { id, name, email } }, { status: 201 });
    setSessionCookie(response, await createSession(id));
    return response;
  } catch (error) {
    console.error("Signup failed", error);
    return NextResponse.json({ error: "Unable to create account" }, { status: 500 });
  }
}