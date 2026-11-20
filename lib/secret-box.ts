/**
 * Reversible encryption for secrets the studio must use later (webhook signing secrets).
 * AES-256-GCM with a key derived from STUDIO_SESSION_SECRET, so a database dump alone does
 * not reveal them. Rotating STUDIO_SESSION_SECRET makes stored secrets unreadable: re-enter them.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { envValue } from "@/lib/auth/session";

function key(): Buffer {
  const secret = envValue("STUDIO_SESSION_SECRET");
  if (!secret) throw new Error("STUDIO_SESSION_SECRET belum diisi");
  return createHash("sha256").update(`secret-box:${secret}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function openSecret(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Format secret tidak dikenal");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
