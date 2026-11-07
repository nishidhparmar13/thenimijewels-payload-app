import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { revalidateAfterChange, revalidateAfterDelete } from '../hooks/revalidateFrontend'

export const DEFAULT_CARE =
  'Keep away from water, perfume and chemicals. Store dry and wipe gently with a soft cloth after use.'

/**
 * Leaves an entered reference alone (upper-cased); otherwise numbers the
 * piece after the highest existing one in its category: NIMI-EAR-017 →
 * NIMI-EAR-018.
 */
const assignRefNo: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) return data

  const entered = data.refNo ?? originalDoc?.refNo
  if (typeof entered === 'string' && entered.trim()) {
    data.refNo = entered.trim().toUpperCase()
    return data
  }

  const categoryRef = data.category ?? originalDoc?.category
  const categoryId = typeof categoryRef === 'object' && categoryRef ? categoryRef.id : categoryRef
  if (!categoryId) return data

  const category = await req.payload.findByID({
    collection: 'categories',
    id: categoryId,
    depth: 0,
    req,
  })
  const prefix = `NIMI-${category.skuPrefix}-`

  const existing = await req.payload.find({
    collection: 'products',
    where: { refNo: { like: prefix } },
    select: { refNo: true },
    pagination: false,
    depth: 0,
    draft: true,
    req,
  })
  const highest = existing.docs.reduce((max, doc) => {
    const match = doc.refNo?.match(/-(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  data.refNo = `${prefix}${String(highest + 1).padStart(3, '0')}`
  return data
}

/**
 * Jewellery pieces. Field names follow the CMS; the storefront maps them to
 * its own shape in nimi/app/lib/cms.ts (title → name, price → amount…).
 */
export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'refNo', 'category', 'price', 'isAvailable', '_status'],
    listSearchableFields: ['title', 'refNo'],
  },
  defaultSort: 'displayOrder',
  access: {
    // Public can read published products; logged-in users see drafts too
    read: ({ req: { user } }) => {
      if (user) return true
      return { _status: { equals: 'published' } }
    },
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  versions: {
    drafts: true,
  },
  hooks: {
    beforeValidate: [assignRefNo],
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  fields: [
    {
      name: 'title',
      label: 'Name',
      type: 'text',
      required: true,
    },
    {
      name: 'refNo',
      label: 'Reference no.',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'e.g. NIMI-EAR-001. Also the product URL. Leave empty to auto-number.',
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'isAvailable',
      label: 'In stock',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar', description: 'Untick to show the piece as sold out.' },
    },
    {
      name: 'label',
      label: 'Badge',
      type: 'select',
      options: [
        { label: 'Trending', value: 'trending' },
        { label: 'New', value: 'new' },
        { label: 'Bestseller', value: 'bestseller' },
      ],
      admin: { position: 'sidebar', description: 'Optional badge on the product card.' },
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar', description: 'Lower numbers appear first in "Featured".' },
    },
    {
      name: 'images',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      required: true,
      admin: { description: 'First image is the card thumbnail; the second shows on hover.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'price',
          label: 'Price (MRP, ₹)',
          type: 'number',
          required: true,
          min: 0,
        },
        {
          name: 'discountAmount',
          label: 'Discount (₹ off)',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
      ],
    },
    {
      name: 'discountDescription',
      type: 'text',
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.discountAmount),
      },
    },
    {
      name: 'type',
      label: 'Style',
      type: 'select',
      required: true,
      defaultValue: 'oxidise',
      admin: { description: 'Drives the filter chips on the category page.' },
      options: [
        { label: 'Oxidised', value: 'oxidise' },
        { label: 'German Silver', value: 'german_silver' },
        { label: 'Korean', value: 'korean' },
        { label: 'Jhumkas', value: 'jhumka' },
        { label: 'Studs', value: 'stud' },
        { label: 'Chokers', value: 'choker' },
        { label: 'Pendants', value: 'pendant' },
        { label: 'Layered', value: 'layered' },
        { label: 'Bands', value: 'band' },
        { label: 'Cocktail', value: 'cocktail' },
        { label: 'Adjustable', value: 'adjustable' },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'materials',
      type: 'text',
      defaultValue: 'Oxidised',
    },
    {
      name: 'care',
      type: 'textarea',
      defaultValue: DEFAULT_CARE,
    },
  ],
}
