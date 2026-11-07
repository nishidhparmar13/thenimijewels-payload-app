import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

/**
 * Tells the storefront (the `nimi` Next.js app) to drop its cached CMS data,
 * so an edit in the admin shows on the site straight away instead of after
 * the 60s fallback revalidation.
 *
 * Needs FRONTEND_URL and REVALIDATE_SECRET in .env (same secret in the
 * storefront's .env). Without them this is a no-op. Bulk scripts (the seed)
 * pass `context.disableRevalidate` to skip it.
 */
const notifyFrontend = (req: PayloadRequest, collection: string) => {
  if (req.context?.disableRevalidate) return

  const frontendUrl = process.env.FRONTEND_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!frontendUrl || !secret) return

  // Fire and forget: a storefront that is down must never block a save.
  fetch(new URL('/api/revalidate', frontendUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
    body: JSON.stringify({ collection }),
  })
    .then((res) => {
      if (!res.ok) req.payload.logger.warn(`Storefront revalidate returned ${res.status}`)
    })
    .catch((err) => {
      req.payload.logger.warn({ err, msg: 'Storefront revalidate failed' })
    })
}

export const revalidateAfterChange: CollectionAfterChangeHook = ({ doc, req, collection }) => {
  notifyFrontend(req, collection.slug)
  return doc
}

export const revalidateAfterDelete: CollectionAfterDeleteHook = ({ doc, req, collection }) => {
  notifyFrontend(req, collection.slug)
  return doc
}
