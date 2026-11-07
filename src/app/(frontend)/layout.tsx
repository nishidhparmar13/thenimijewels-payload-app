import { Cormorant_Garamond, Montserrat } from 'next/font/google'
import React from 'react'

import './styles.css'

// Same type pairing as the storefront (nimi/app/layout.tsx).
const cormorantGaramond = Cormorant_Garamond({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
})

const montserrat = Montserrat({
  variable: '--font-body',
  subsets: ['latin'],
})

export const metadata = {
  title: 'nimi studio',
  description: 'Manage the nimi catalogue — pieces, categories and photography.',
  robots: { index: false, follow: false },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" className={`${cormorantGaramond.variable} ${montserrat.variable}`}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
