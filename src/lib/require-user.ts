import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

export async function requireUser() {
  const userId = await getUserId();
  return userId;
}

export function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}