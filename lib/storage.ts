import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

/** URL a reviewer (or the dashboard) uses to view the file. */
export function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: ASSET_BUCKET, Key: key }), { expiresIn });
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
