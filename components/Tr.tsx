'use client'

import React from 'react'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Bilingual text for Server Components, which can't read the visitor's language
 * (it's stored in the browser). Usage: <Tr en="Order ID:" bn="অর্ডার আইডি:" />
 * Both props also accept JSX, e.g. sentences with <strong> parts.
 */
export default function Tr({ en, bn }: { en: React.ReactNode; bn: React.ReactNode }) {
  const { isBangla } = useLanguage()
  return <>{isBangla ? bn : en}</>
}
