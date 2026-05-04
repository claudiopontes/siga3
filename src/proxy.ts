import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/signin", "/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);

    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("next", pathname);

    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next|images|favicon.ico|.*\\..*).*)"],
};
