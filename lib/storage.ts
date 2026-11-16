import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Private bucket for studio assets. Assets are only reachable through presigned URLs. */
export const ASSET_BUCKET = process.env.S3_BUCKET_PRIVATE ?? "storage-private";

const globalForS3 = globalThis as unknown as { studioS3?: S3Client };

function s3(): S3Client {
  if (!globalForS3.studioS3) {
    globalForS3.studioS3 = new S3Client({
      region: process.env.AWS_REGION ?? "auto",
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      forcePathStyle: true,
    });
  }
  return globalForS3.studioS3;
}

export function assetKey(jobId: string, version: number, extension: string): string {
  return `studio/jobs/${jobId}/v${version}.${extension.replace(/^\./, "")}`;
}

/** URL the agent PUTs the file to. */
export function presignUpload(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: ASSET_BUCKET, Key: key, ContentType: contentType }), {
    expiresIn,
  });
}

/**
 * URL a reviewer (or the dashboard) uses to view the file.
 * With `downloadAs`, the browser saves it under that file name instead of showing it.
 */
export function presignDownload(key: string, expiresIn = 3600, downloadAs?: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: ASSET_BUCKET,
      Key: key,
      ...(downloadAs ? { ResponseContentDisposition: `attachment; filename="${downloadAs}"` } : {}),
    }),
    { expiresIn },
  );
}

/** Writes a small server-generated object (e.g. a keyframe contact sheet). */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: ASSET_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

/** Streams an object to a local file without holding it in memory (videos). */
export async function downloadToFile(key: string, path: string): Promise<void> {
  const res = await s3().send(new GetObjectCommand({ Bucket: ASSET_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`Object ${key} has no body`);
  await pipeline(res.Body as Readable, createWriteStream(path));
}

/** Reads a whole object into memory. Callers check the size with headObject first. */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: ASSET_BUCKET, Key: key }));
  if (!res.Body) throw new Error(`Object ${key} has no body`);
  return Buffer.from(await res.Body.transformToByteArray());
}

/** Returns size and content type, or null when the object does not exist. */
export async function headObject(key: string): Promise<{ bytes: number; contentType?: string } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: ASSET_BUCKET, Key: key }));
    return { bytes: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return null;
    throw e;
  }
}
