import { AUTH_COOKIE_NAME, createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

function safeFilename(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || "jpg";
  return `foto.${extension.replace(/[^a-z0-9]/g, "")}`;
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

async function ensureBucket() {
  const supabase = getAdminSupabase();
  const bucket = process.env.AUTH_AVATAR_BUCKET || "avatars";
  const { error } = await supabase.storage.getBucket(bucket);

  if (!error) {
    return bucket;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: String(MAX_FILE_SIZE),
    allowedMimeTypes: ALLOWED_TYPES,
  });

  if (createError) {
    throw new Error(createError.message);
  }

  return bucket;
}

function missingColumnResponse() {
  return NextResponse.json(
    {
      message:
        "As colunas foto_url/foto_posicao ainda não existem em usuarios_autorizados. Rode o SQL atualizado no Supabase.",
    },
    { status: 500 },
  );
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

  const supabase = getAdminSupabase();
  const bucket = await ensureBucket();
  const path = `${session.username}/${Date.now()}-${safeFilename(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) {
    return NextResponse.json({ message: uploadError.message }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
  const photoUrl = publicData.publicUrl;
  const photoPosition = "center center";
  const table = process.env.AUTH_USERS_TABLE || "usuarios_autorizados";
  const { error: updateError } = await supabase
    .from(table)
    .update({
      foto_url: photoUrl,
      foto_posicao: photoPosition,
      atualizado_em: new Date().toISOString(),
    })
    .eq("usuario_ad", session.username);

  if (updateError) {
    if (updateError.code === "42703") {
      return missingColumnResponse();
    }

    return NextResponse.json({ message: updateError.message }, { status: 500 });
  }

  const updatedSession = {
    ...session,
    photoUrl,
    photoPosition,
  };
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
}

export async function PATCH(request: Request) {
  const { session, response } = await getSessionOrResponse();

  if (!session) {
    return response;
  }

  const body = (await request.json()) as { photoPosition?: string };
  const photoPosition = normalizePosition(body.photoPosition);
  const table = process.env.AUTH_USERS_TABLE || "usuarios_autorizados";
  const { error } = await getAdminSupabase()
    .from(table)
    .update({
      foto_posicao: photoPosition,
      atualizado_em: new Date().toISOString(),
    })
    .eq("usuario_ad", session.username);

  if (error) {
    if (error.code === "42703") {
      return missingColumnResponse();
    }

    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const token = await createSessionToken({
    ...session,
    photoPosition,
  });
  const responseJson = NextResponse.json({ photoPosition });

  responseJson.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
  });

  return responseJson;
}
