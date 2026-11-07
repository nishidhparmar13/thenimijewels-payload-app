import type { CollectionConfig } from 'payload'

import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidateFrontend'

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Shop categories (Earrings, Necklaces, Rings…). Drives the "Shop by
 * Category" cards on the home page, the footer links and each
 * /categories/<slug> page on the storefront.
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'skuPrefix', 'displayOrder'],
    description: 'Shop categories shown on the home page, in the footer and as category pages.',
  },
  defaultSort: 'displayOrder',
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  hooks: {
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'URL segment: /categories/<slug>. Filled from the title if left empty.',
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) =>
            toSlug(typeof value === 'string' && value ? value : (data?.title ?? '')),
        ],
      },
    },
    {
      name: 'skuPrefix',
      label: 'Reference prefix',
      type: 'text',
      required: true,
      admin: {
        position: 'sidebar',
        description: 'Used to auto-number products, e.g. EAR → NIMI-EAR-018.',
      },
      hooks: {
        beforeValidate: [({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)],
      },
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'Lower numbers appear first.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Card image on the home page "Shop by Category" section.' },
    },
    {
      name: 'description',
      label: 'Short description',
      type: 'textarea',
      admin: { description: 'One-line tagline for the category card.' },
    },
    {
      name: 'pageDescription',
      label: 'Page intro',
      type: 'textarea',
      admin: { description: 'Shown under the heading on the category page.' },
    },
    {
      name: 'metaDescription',
      label: 'SEO description',
      type: 'textarea',
      admin: { description: 'Search engine / link preview description for the category page.' },
    },
    {
      name: 'products',
      type: 'join',
      collection: 'products',
      on: 'category',
      admin: { defaultColumns: ['title', 'refNo', 'price', '_status'] },
    },
  ],
}
