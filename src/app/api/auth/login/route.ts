import { authenticateActiveDirectoryUser } from "@/lib/auth/active-directory";
import { getAuthorizedUser } from "@/lib/auth/authorization";
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

    const adUser = await authenticateActiveDirectoryUser(body.usuario ?? "", body.senha ?? "");

    if (!adUser) {
      return NextResponse.json(
        { message: "Usuário ou senha inválido." },
        { status: 401 },
      );
    }

    let authorizedUser;

    try {
      authorizedUser = await getAuthorizedUser(adUser.username);
    } catch (error) {
      console.error("Falha ao consultar autorização no Supabase", error);

      return NextResponse.json(
        { message: "Usuário autenticado no AD, mas não foi possível consultar a autorização no Supabase." },
        { status: 500 },
      );
    }

    if (!authorizedUser) {
      return NextResponse.json(
        { message: "Usuário autenticado, mas sem autorização para acessar o Varadouro Digital." },
        { status: 403 },
      );
    }

    const maxAge = body.lembrar ? 60 * 60 * 24 * 7 : 60 * 60 * 8;
    const token = await createSessionToken({
      username: adUser.username,
      displayName: authorizedUser.displayName ?? adUser.displayName,
      email: authorizedUser.email ?? adUser.email,
      profile: authorizedUser.profile,
      groups: adUser.groups,
      expiresAt: Date.now() + maxAge * 1000,
    });
    const response = NextResponse.json({
      user: {
        username: adUser.username,
        displayName: authorizedUser.displayName ?? adUser.displayName,
        email: authorizedUser.email ?? adUser.email,
        profile: authorizedUser.profile,
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
      { message: "Não foi possível autenticar no Active Directory." },
      { status: 500 },
    );
  }
}
