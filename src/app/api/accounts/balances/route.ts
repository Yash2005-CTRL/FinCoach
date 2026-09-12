import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/require-user";

export async function POST(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  try {
    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });

    const [userRows] = await db.query("SELECT password_hash AS passwordHash FROM users WHERE id = ? LIMIT 1", [userId]);
    const user = Array.isArray(userRows) ? userRows[0] as { passwordHash: string | null } | undefined : undefined;
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const [accounts] = await db.query("SELECT id, name, account_number AS accountNumber, type, institution, balance, currency, created_at AS createdAt FROM accounts WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Account balance verification failed", error);
    return NextResponse.json({ error: "Unable to verify account balance access" }, { status: 500 });
  }
}
