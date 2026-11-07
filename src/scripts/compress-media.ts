/**
 * Compresses the images already stored in R2, using the same settings as
 * new uploads (see collections/Media.ts): fit within MAX_SIDE px, WebP at
 * QUALITY.
 *
 *   npm run compress-media            # dry run: report only, nothing written
 *   APPLY=1 npm run compress-media    # back up, convert, update, clean up
 *
 * For each JPEG/PNG/WebP image that gets at least MIN_SAVING smaller, APPLY=1:
 *   1. saves the original bytes to ./r2-backup/<key>
 *   2. uploads the WebP as <name>.webp
 *   3. points the media document at it (filename, url, mimeType, size, dims)
 *   4. deletes the old object from R2
 * Products and categories reference media by ID, and the storefront reads
 * `media.url` from the API, so nothing else needs changing. SVG/GIF are
 * left alone. Safe to re-run: already-compressed files are skipped.
 */
import config from '@payload-config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'
import sharp from 'sharp'

import { MAX_SIDE, QUALITY } from '../collections/Media'
import { r2Config, r2Enabled } from '../storage/r2'

const MIN_SAVING = 0.1 // only replace when ≥10% smaller
const CONVERTIBLE = new Set(['image/jpeg', 'image/png', 'image/webp'])
// `payload run` does not forward CLI flags, so APPLY=1 is the reliable switch.
const apply = process.env.APPLY === '1' || process.argv.includes('--apply')
const backupDir = path.resolve(process.cwd(), 'r2-backup')

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`

const compress = (input: Buffer) =>
  sharp(input)
    .rotate() // bake in EXIF orientation before metadata is dropped
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer({ resolveWithObject: true })

const run = async () => {
  if (!r2Enabled) throw new Error('R2_* env vars are not set; nothing to compress.')

  const payload = await getPayload({ config })
  const s3 = new S3Client(r2Config.client)
  const Bucket = r2Config.bucket
  const { docs } = await payload.find({
    collection: 'media',
    limit: 0,
    pagination: false,
    depth: 0,
  })

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${docs.length} media documents\n`)

  // Filenames are unique; avoid e.g. 1.jpeg and 1.png both becoming 1.webp.
  const taken = new Set(docs.map((d) => d.filename).filter(Boolean) as string[])
  const webpName = (filename: string) => {
    const base = filename.replace(/\.[^.]+$/, '')
    let name = `${base}.webp`
    for (let i = 1; taken.has(name) && name !== filename; i++) name = `${base}-${i}.webp`
    taken.add(name)
    return name
  }

  let before = 0
  let after = 0
  let replaced = 0

  for (const doc of docs) {
    const { filename, mimeType } = doc
    if (!filename || !mimeType) continue
    const prefix = (doc as { prefix?: string }).prefix
    const keyFor = (name: string) => (prefix ? `${prefix}/${name}` : name)
    const key = keyFor(filename)

    if (!CONVERTIBLE.has(mimeType)) {
      console.log(`  SKIP     ${key} (${mimeType})`)
      continue
    }
    // WebP within the size cap is already done: re-encoding lossy output
    // again only trades quality for a few KB.
    const oversized = (doc.width ?? 0) > MAX_SIDE || (doc.height ?? 0) > MAX_SIDE
    if (mimeType === 'image/webp' && !oversized) {
      console.log(`  OK       ${key} (already WebP)`)
      continue
    }

    let original: Buffer
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket, Key: key }))
      original = Buffer.from(await obj.Body!.transformToByteArray())
    } catch (err) {
      console.log(`  MISSING  ${key} (${(err as Error).name})`)
      continue
    }

    before += original.length
    const { data, info } = await compress(original)
    const saving = 1 - data.length / original.length
    if (saving < MIN_SAVING) {
      after += original.length
      console.log(`  OK       ${key} ${kb(original.length)} (already small)`)
      continue
    }

    after += data.length
    replaced++
    const newName = mimeType === 'image/webp' ? filename : webpName(filename)
    const newKey = keyFor(newName)
    console.log(
      `  SHRINK   ${key} → ${newKey}  ${kb(original.length)} → ${kb(data.length)}` +
        ` (-${(saving * 100).toFixed(0)}%)  ${doc.width}x${doc.height} → ${info.width}x${info.height}`,
    )

    if (!apply) continue

    const backupPath = path.join(backupDir, key)
    await fs.mkdir(path.dirname(backupPath), { recursive: true })
    await fs.writeFile(backupPath, original)

    await s3.send(
      new PutObjectCommand({ Bucket, Key: newKey, Body: data, ContentType: 'image/webp' }),
    )
    // db.updateOne skips hooks and upload handling: only the metadata changes.
    await payload.db.updateOne({
      collection: 'media',
      id: doc.id,
      data: {
        filename: newName,
        url: `/api/media/file/${encodeURIComponent(newName)}`,
        mimeType: 'image/webp',
        filesize: data.length,
        width: info.width,
        height: info.height,
      },
    })
    if (newKey !== key) await s3.send(new DeleteObjectCommand({ Bucket, Key: key }))
  }

  console.log(
    `\n${replaced} of ${docs.length} ${apply ? 'replaced' : 'would be replaced'}. ` +
      `Total ${kb(before)} → ${kb(after)} (-${before ? (((before - after) / before) * 100).toFixed(0) : 0}%)`,
  )
  if (apply && replaced) {
    console.log(`Originals backed up to ${backupDir}`)
    await revalidateStorefront()
  }
}

/** Image URLs changed, so ask the storefront to refetch products/categories. */
const revalidateStorefront = async () => {
  const { FRONTEND_URL, REVALIDATE_SECRET } = process.env
  if (!FRONTEND_URL || !REVALIDATE_SECRET) return
  for (const collection of ['media', 'products', 'categories']) {
    try {
      await fetch(new URL('/api/revalidate', FRONTEND_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': REVALIDATE_SECRET },
        body: JSON.stringify({ collection }),
      })
    } catch {
      console.log(`Storefront at ${FRONTEND_URL} not reachable; it will refresh within 60s.`)
      return
    }
  }
}

try {
  await run()
  process.exit(0)
} catch (err) {
  console.error(err)
  process.exit(1)
}
