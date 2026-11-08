import { createHash, createHmac } from "node:crypto";

// URLs prefirmadas para Cloudflare R2 (API compatible con S3, firma SigV4), sin
// instalar el SDK de AWS. El navegador sube el video directo a R2 con una URL de
// un solo uso, y para reproducirlo se genera otra URL de lectura que caduca.

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_LEARNING_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

// Codificación de la URL según AWS: todo menos A-Z a-z 0-9 - _ . ~ (y "/" en rutas).
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export type PresignInput = {
  method: "GET" | "PUT" | "DELETE";
  host: string;
  path: string; // empieza con "/"
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSec: number;
  now?: Date;
};

export function presign(i: PresignInput): string {
  const now = i.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20130524T000000Z
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${i.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${i.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(i.expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(query[k])}`)
    .join("&");
  const canonicalPath = i.path.split("/").map((seg) => enc(seg)).join("/");
  const canonicalRequest = [i.method, canonicalPath, canonicalQuery, `host:${i.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac("AWS4" + i.secretAccessKey, date);
  const kRegion = hmac(kDate, i.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return `https://${i.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function r2Url(method: "GET" | "PUT" | "DELETE", key: string, expiresSec: number): string {
  const c = r2Config();
  if (!c) throw new Error("R2 no está configurado");
  return presign({
    method,
    host: `${c.accountId}.r2.cloudflarestorage.com`,
    path: `/${c.bucket}/${key}`,
    region: "auto",
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    expiresSec,
  });
}

export const r2UploadUrl = (key: string) => r2Url("PUT", key, 15 * 60);
export const r2ReadUrl = (key: string, expiresSec = 4 * 3600) => r2Url("GET", key, expiresSec);

export async function r2Delete(key: string): Promise<void> {
  const res = await fetch(r2Url("DELETE", key, 60), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 respondió ${res.status} al borrar`);
}
