import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { cookies } from "next/headers";

export function isAdminProfile(profile?: string) {
  const normalized = profile?.trim().toLowerCase();

  return normalized === "admin" || normalized === "administrador";
}

export async function getCurrentSession() {
  const cookieStore = await cookies();

  return verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

export async function requireAdminSession() {
  const session = await getCurrentSession();

  if (!session || !isAdminProfile(session.profile)) {
    return null;
  }

  return session;
}
