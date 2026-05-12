import { requireAdminSession } from "@/lib/auth/access-control";
import { dbQuery } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type UserPayload = {
  id?: string;
  usuarioAd?: string;
  nome?: string;
  email?: string;
  perfil?: string;
  ativo?: boolean;
};

type UserRow = {
  id: string;
  usuario_ad: string;
  nome: string | null;
  email: string | null;
  perfil: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

function normalizeUsername(username?: string) {
  return username?.trim().toLowerCase() ?? "";
}

function normalizeProfile(profile?: string) {
  return profile?.trim().toLowerCase() || "usuario";
}

function tableName() {
  return process.env.AUTH_USERS_TABLE || "usuarios_autorizados";
}

export async function GET() {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  try {
    const users = await dbQuery<UserRow>(
      `SELECT id, usuario_ad, nome, email, perfil, ativo, criado_em, atualizado_em
       FROM ${tableName()}
       ORDER BY usuario_ad ASC`,
    );
    return NextResponse.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  const body = (await request.json()) as UserPayload;
  const usuarioAd = normalizeUsername(body.usuarioAd);

  if (!usuarioAd) {
    return NextResponse.json({ message: "Informe o usuário AD." }, { status: 400 });
  }

  try {
    const rows = await dbQuery<UserRow>(
      `INSERT INTO ${tableName()} (usuario_ad, nome, email, perfil, ativo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, usuario_ad, nome, email, perfil, ativo, criado_em, atualizado_em`,
      [
        usuarioAd,
        body.nome?.trim() || null,
        body.email?.trim() || null,
        normalizeProfile(body.perfil),
        body.ativo ?? true,
      ],
    );
    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  const body = (await request.json()) as UserPayload;

  if (!body.id) {
    return NextResponse.json({ message: "Informe o id do usuário." }, { status: 400 });
  }

  try {
    const rows = await dbQuery<UserRow>(
      `UPDATE ${tableName()}
       SET nome = $1, email = $2, perfil = $3, ativo = $4, atualizado_em = now()
       WHERE id = $5
       RETURNING id, usuario_ad, nome, email, perfil, ativo, criado_em, atualizado_em`,
      [
        body.nome?.trim() || null,
        body.email?.trim() || null,
        normalizeProfile(body.perfil),
        body.ativo ?? true,
        body.id,
      ],
    );

    if (rows.length === 0) {
      return NextResponse.json({ message: "Usuário não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ user: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
