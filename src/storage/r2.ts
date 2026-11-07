import type { S3ClientConfig } from '@aws-sdk/client-s3'

/**
 * Cloudflare R2 connection, from .env:
 *
 *   R2_ACCOUNT_ID         Cloudflare account ID (R2 overview page)
 *   R2_ACCESS_KEY_ID      R2 API token → Access Key ID
 *   R2_SECRET_ACCESS_KEY  R2 API token → Secret Access Key
 *   R2_BUCKET             bucket name (thenimijewels)
 *
 * Until all four are set, uploads fall back to the local media/ folder.
 */
export const r2Enabled = Boolean(
  process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
)

export const r2Config: { bucket: string; client: S3ClientConfig } = {
  bucket: process.env.R2_BUCKET || '',
  client: {
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    // R2 rejects the CRC checksums newer AWS SDKs add by default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  },
}
