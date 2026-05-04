import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getAuthorizedUser } from "@/lib/auth/authorization";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const authorizedUser = await getAuthorizedUser(session.username).catch(() => null);

  return NextResponse.json({
    user: {
      username: session.username,
      displayName: authorizedUser?.displayName ?? session.displayName,
      email: authorizedUser?.email ?? session.email,
      profile: authorizedUser?.profile ?? session.profile,
      photoUrl: authorizedUser?.photoUrl ?? session.photoUrl,
      photoPosition: authorizedUser?.photoPosition ?? session.photoPosition,
    },
  });
}
