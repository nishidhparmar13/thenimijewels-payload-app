import type { CollectionConfig } from 'payload'

/** Longest side, in px, an uploaded image is scaled down to. */
export const MAX_SIDE = 2000
/** Encoder quality for uploaded images (1–100). */
export const QUALITY = 80

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: ['image/*'],
    // Every upload is compressed before it reaches R2: scaled to fit within
    // MAX_SIDE × MAX_SIDE (never enlarged), EXIF-rotated and re-encoded as
    // WebP. Payload renames the file to .webp. SVGs are stored as-is.
    resizeOptions: {
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    },
    formatOptions: {
      format: 'webp',
      options: { quality: QUALITY },
    },
  },
}
