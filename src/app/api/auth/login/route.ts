import { authenticateActiveDirectoryUser } from "@/lib/auth/active-directory";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      usuario?: string;
      senha?: string;
      lembrar?: boolean;
    };

    const user = await authenticateActiveDirectoryUser(body.usuario ?? "", body.senha ?? "");

    if (!user) {
      return NextResponse.json(
        { message: "Usuario, senha ou grupo de acesso invalido." },
        { status: 401 },
      );
    }

    const maxAge = body.lembrar ? 60 * 60 * 24 * 7 : 60 * 60 * 8;
    const token = await createSessionToken({
      ...user,
      expiresAt: Date.now() + maxAge * 1000,
    });
    const response = NextResponse.json({
      user: {
        username: user.username,
        displayName: user.displayName,
        email: user.email,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });

    return response;
  } catch (error) {
    console.error("Falha no login AD", error);

    return NextResponse.json(
      { message: "Nao foi possivel autenticar no Active Directory." },
      { status: 500 },
    );
  }
}
