/**
 * Imports the storefront's original JSON catalogue (categories + products)
 * and its images into Payload.
 *
 *   npm run seed
 *
 * Safe to re-run: categories are matched by slug, products by refNo and
 * images by filename, so existing documents are updated instead of
 * duplicated. Edits made in the admin to seeded fields WILL be overwritten
 * by a re-run, so treat this as a one-off import.
 *
 * The import has already been run and its images now live in R2. The
 * original photos were removed from the storefront's public/ folder, so a
 * re-run only works for images already in the media library (matched by
 * filename). To import new photos, point SEED_ASSETS_DIR at a folder laid
 * out like the old nimi/public (categories/…, main-categories/…).
 */
import config from '@payload-config'
import fs from 'fs/promises'
import path from 'path'
import { getPayload, type Payload } from 'payload'
import { fileURLToPath } from 'url'

import { DEFAULT_CARE } from '../collections/Products'
import type { Product } from '../payload-types'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(dirname, 'data')
const assetsDir = path.resolve(
  process.env.SEED_ASSETS_DIR ?? path.join(dirname, '../../../nimi/public'),
)

// Skip the storefront webhook for every write; one bulk import is enough.
// A fresh object per call: the storage plugin caches upload data on
// req.context, so sharing one object across writes can mix up files.
const context = () => ({ disableRevalidate: true })

interface SeedCategory {
  title: string
  slug: string
  skuPrefix: string
  description: string
  pageDescription: string
  metaDescription: string
  image: string
  productsFile: string
}

interface SeedProduct {
  name: string
  description?: string
  amount: number
  image: string[]
  ref_no: string
  discount_amount: number
  discount_description?: string
  type: string
  label: string
  materials?: string
  care?: string
  is_available?: boolean
}

const readJson = async <T>(file: string): Promise<T> =>
  JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8')) as T

const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
}

/** Uploads public/<src> as <filename> unless a media doc with that name exists. */
const upsertMedia = async (
  payload: Payload,
  src: string,
  filename: string,
  alt: string,
): Promise<string> => {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs[0]) return existing.docs[0].id

  const filePath = path.join(assetsDir, src)
  const data = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()

  const doc = await payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data,
      name: filename,
      mimetype: mimeTypes[ext] ?? 'application/octet-stream',
      size: data.length,
    },
    context: context(),
  })
  payload.logger.info(`  uploaded ${filename}`)
  return doc.id
}

const seed = async () => {
  const payload = await getPayload({ config })
  payload.logger.info(`Seeding from ${dataDir}, images from ${assetsDir}`)

  const categories = await readJson<SeedCategory[]>('categories.json')
  const categoryIds = new Map<string, string>()

  for (const [index, category] of categories.entries()) {
    payload.logger.info(`Category: ${category.title}`)

    const imageId = await upsertMedia(
      payload,
      category.image,
      `category-${category.slug}${path.extname(category.image)}`,
      `${category.title} category`,
    )

    const data = {
      title: category.title,
      slug: category.slug,
      skuPrefix: category.skuPrefix,
      displayOrder: index,
      image: imageId,
      description: category.description,
      pageDescription: category.pageDescription,
      metaDescription: category.metaDescription,
    }

    const existing = await payload.find({
      collection: 'categories',
      where: { slug: { equals: category.slug } },
      limit: 1,
      depth: 0,
    })
    const doc = existing.docs[0]
      ? await payload.update({ collection: 'categories', id: existing.docs[0].id, data, context: context() })
      : await payload.create({ collection: 'categories', data, context: context() })
    categoryIds.set(category.slug, doc.id)

    const products = await readJson<SeedProduct[]>(category.productsFile)
    for (const [position, product] of products.entries()) {
      const refNo = product.ref_no.toUpperCase()

      const images: string[] = []
      for (const [n, src] of product.image.entries()) {
        images.push(
          await upsertMedia(
            payload,
            src,
            `${refNo.toLowerCase()}-${n + 1}${path.extname(src)}`,
            `${product.name} – image ${n + 1}`,
          ),
        )
      }

      const productData = {
        title: product.name,
        refNo,
        category: doc.id,
        price: product.amount,
        discountAmount: product.discount_amount ?? 0,
        discountDescription: product.discount_description || undefined,
        description: product.description || undefined,
        type: product.type as Product['type'],
        label: (product.label || null) as Product['label'],
        materials: product.materials ?? 'Oxidised',
        care: product.care ?? DEFAULT_CARE,
        isAvailable: product.is_available !== false,
        displayOrder: position,
        images,
        _status: 'published' as const,
      }

      const found = await payload.find({
        collection: 'products',
        where: { refNo: { equals: refNo } },
        limit: 1,
        depth: 0,
        draft: true,
      })
      if (found.docs[0]) {
        await payload.update({ collection: 'products', id: found.docs[0].id, data: productData, context: context() })
      } else {
        await payload.create({ collection: 'products', data: productData, context: context() })
      }
      payload.logger.info(`  product ${refNo} – ${product.name}`)
    }
  }

  // Products created before this schema stored their category in `type`
  // (e.g. "earrings") and had no reference number. Move them over.
  const legacy = await payload.find({
    collection: 'products',
    where: { category: { exists: false } },
    pagination: false,
    depth: 0,
    draft: true,
  })
  for (const doc of legacy.docs) {
    const legacyType = doc.type as string
    const categoryId = categoryIds.get(legacyType)
    if (!categoryId) {
      payload.logger.warn(`Legacy product "${doc.title}" has no matching category – fix it in the admin.`)
      continue
    }
    const updated = await payload.update({
      collection: 'products',
      id: doc.id,
      data: { category: categoryId, type: 'oxidise', displayOrder: 999 },
      context: context(),
    })
    payload.logger.info(`Migrated legacy product "${doc.title}" → ${legacyType} as ${updated.refNo}`)
  }

  payload.logger.info('Seed complete.')
}

try {
  await seed()
  process.exit(0)
} catch (err) {
  console.error(err)
  process.exit(1)
}
