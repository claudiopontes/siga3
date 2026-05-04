import { requireAdminSession } from "@/lib/auth/access-control";
import { getAdminSupabase } from "@/lib/supabase-admin";
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

  const { data, error } = await getAdminSupabase()
    .from(tableName())
    .select("id,usuario_ad,nome,email,perfil,ativo,criado_em,atualizado_em")
    .order("usuario_ad", { ascending: true });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
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

  const { data, error } = await getAdminSupabase()
    .from(tableName())
    .insert({
      usuario_ad: usuarioAd,
      nome: body.nome?.trim() || null,
      email: body.email?.trim() || null,
      perfil: normalizeProfile(body.perfil),
      ativo: body.ativo ?? true,
    })
    .select("id,usuario_ad,nome,email,perfil,ativo,criado_em,atualizado_em")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data }, { status: 201 });
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

  const { data, error } = await getAdminSupabase()
    .from(tableName())
    .update({
      nome: body.nome?.trim() || null,
      email: body.email?.trim() || null,
      perfil: normalizeProfile(body.perfil),
      ativo: body.ativo ?? true,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("id,usuario_ad,nome,email,perfil,ativo,criado_em,atualizado_em")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}
