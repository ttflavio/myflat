// Hash de senha com scrypt (nativo do Node). Formato: scrypt$N$r$p$saltB64$hashB64
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export const PASSWORD_MIN = 10;

/** Regras mínimas: comprimento e não ser trivial. Devolve a mensagem de erro ou null. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > 200) return "Senha longa demais.";
  if (/^(.)\1+$/.test(password)) return "A senha não pode repetir um único caractere.";
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "A senha não pode conter o seu e-mail.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash fixo para comparar quando o usuário não existe (mesmo tempo de resposta). */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(12).toString("hex"));
  return dummy;
}

/** Senha provisória legível (sem caracteres ambíguos), para o administrador repassar. */
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(14);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
