import { headers as getHeaders } from 'next/headers.js'
import Image from 'next/image'
import { getPayload } from 'payload'
import React from 'react'

import config from '@/payload.config'
import './styles.css'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://thenimijewels.com'

export default async function HomePage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  const admin = payloadConfig.routes.admin

  // Catalogue snapshot — only fetched (and shown) for signed-in staff.
  const stats = user
    ? await Promise.all([
        payload.count({ collection: 'products', where: { _status: { equals: 'published' } } }),
        payload.count({ collection: 'products', where: { _status: { equals: 'draft' } } }),
        payload.count({
          collection: 'products',
          where: {
            and: [{ _status: { equals: 'published' } }, { isAvailable: { equals: false } }],
          },
        }),
        payload.count({ collection: 'categories' }),
      ]).then(([live, drafts, soldOut, categories]) => [
        { label: 'Live pieces', value: live.totalDocs },
        { label: 'Categories', value: categories.totalDocs },
        { label: 'Sold out', value: soldOut.totalDocs },
        { label: 'Drafts', value: drafts.totalDocs },
      ])
    : []

  const shortcuts = [
    {
      title: 'Add a piece',
      copy: 'New product with photos, price and badge.',
      href: `${admin}/collections/products/create`,
    },
    {
      title: 'Products',
      copy: 'Edit prices, stock and discounts.',
      href: `${admin}/collections/products`,
    },
    {
      title: 'Categories',
      copy: 'Card images, intros and ordering.',
      href: `${admin}/collections/categories`,
    },
    {
      title: 'Media library',
      copy: 'Every product and category photo.',
      href: `${admin}/collections/media`,
    },
  ]

  const name = user?.email?.split('@')[0]

  return (
    <div className="studio">
      {/* ---------------- Brand panel ---------------- */}
      <aside className="brand">
        <div className="brandHalo" aria-hidden="true" />
        <div className="brandInner">
          <Image
            src="/brand/nimi-logo-white.png"
            alt="nimi — jewels with soul"
            width={900}
            height={600}
            priority
            className="brandLogo"
          />
          <p className="brandTag">Catalogue studio</p>
        </div>
        <p className="brandFoot">thenimijewels.com</p>
      </aside>

      {/* ---------------- Work area ---------------- */}
      <section className="panel">
        <div className="panelInner">
          <span className="eyebrow">{user ? 'Welcome back' : 'Store team'}</span>

          <h1 className="title">
            {user ? (
              <>
                Hello, <em>{name}</em>
              </>
            ) : (
              <>
                Welcome to the <em>nimi</em> studio
              </>
            )}
          </h1>

          <div className="rule" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>

          <p className="lede">
            Manage every piece on the storefront: photography, prices, stock and categories.
            Changes appear on the site as soon as you save.
          </p>

          <div className="actions">
            <a className="btn btnPrimary" href={admin}>
              {user ? 'Open dashboard' : 'Sign in'}
              <span aria-hidden="true">→</span>
            </a>
            <a className="btn btnGhost" href={FRONTEND_URL} rel="noopener noreferrer" target="_blank">
              View storefront
            </a>
          </div>

          {user && (
            <>
              <dl className="stats">
                {stats.map((stat) => (
                  <div key={stat.label} className="stat">
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>

              <nav className="shortcuts" aria-label="Shortcuts">
                {shortcuts.map((item) => (
                  <a key={item.title} href={item.href} className="shortcut">
                    <span className="shortcutTitle">
                      {item.title}
                      <span aria-hidden="true" className="shortcutArrow">
                        →
                      </span>
                    </span>
                    <span className="shortcutCopy">{item.copy}</span>
                  </a>
                ))}
              </nav>
            </>
          )}
        </div>

        <footer className="footer">© {new Date().getFullYear()} nimi · Jewels with soul</footer>
      </section>
    </div>
  )
}
