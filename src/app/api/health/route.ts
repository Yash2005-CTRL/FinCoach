import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.query("SELECT 1 AS ok");
    return NextResponse.json({ ok: true, database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Database health check failed", error);
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}