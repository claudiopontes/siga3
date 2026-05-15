import { createHash } from "crypto";

export function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}
