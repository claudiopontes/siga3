import { AUTH_COOKIE_NAME, createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_POSITIONS = new Set([
  "center center",
  "center top",
  "center bottom",
  "left center",
  "right center",
]);

function safeFilename(username: string, filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = extension.replace(/[^a-z0-9]/g, "");
  const safeUser = username.replace(/[^a-z0-9._-]/g, "_");
  return `${safeUser}-${Date.now()}.${safeExt}`;
}

function normalizePosition(position?: string) {
  return position && ALLOWED_POSITIONS.has(position) ? position : "center center";
}

async function getSessionOrResponse() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ message: "Sessão expirada." }, { status: 401 }),
    };
  }

  return { session, response: null };
}

async function salvarArquivoLocal(file: File, username: string): Promise<string> {
  const uploadDir = join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(uploadDir, { recursive: true });

  const filename = safeFilename(username, file.name);
  const filepath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return `/uploads/avatars/${filename}`;
}

export async function POST(request: Request) {
  const { session, response } = await getSessionOrResponse();

  if (!session) {
    return response;
  }

  const formData = await request.formData();
  const file = formData.get("foto");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Envie uma foto para atualizar o perfil." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ message: "Use uma imagem JPG, PNG ou WebP." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ message: "A foto deve ter no máximo 4 MB." }, { status: 400 });
  }

  try {
    const photoUrl = await salvarArquivoLocal(file, session.username);
    const photoPosition = "center center";
    const table = process.env.AUTH_USERS_TABLE || "usuarios_autorizados";

    await dbQuery(
      `UPDATE ${table}
       SET foto_url = $1, foto_posicao = $2, atualizado_em = now()
       WHERE usuario_ad = $3`,
      [photoUrl, photoPosition, session.username],
    );

    const updatedSession = { ...session, photoUrl, photoPosition };
    const token = await createSessionToken(updatedSession);
    const responseJson = NextResponse.json({ photoUrl, photoPosition });

    responseJson.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
    });

    return responseJson;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { session, response } = await getSessionOrResponse();

  if (!session) {
    return response;
  }

  const body = (await request.json()) as { photoPosition?: string };
  const photoPosition = normalizePosition(body.photoPosition);
  const table = process.env.AUTH_USERS_TABLE || "usuarios_autorizados";

  try {
    await dbQuery(
      `UPDATE ${table}
       SET foto_posicao = $1, atualizado_em = now()
       WHERE usuario_ad = $2`,
      [photoPosition, session.username],
    );

    const token = await createSessionToken({ ...session, photoPosition });
    const responseJson = NextResponse.json({ photoPosition });

    responseJson.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
    });

    return responseJson;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
