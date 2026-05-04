import { AUTH_COOKIE_NAME } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.delete(AUTH_COOKIE_NAME);

  return response;
}
