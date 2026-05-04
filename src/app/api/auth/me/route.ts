import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      username: session.username,
      displayName: session.displayName,
      email: session.email,
    },
  });
}
