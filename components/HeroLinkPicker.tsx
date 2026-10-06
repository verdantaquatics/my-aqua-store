'use client'

import React, { useState } from 'react'

interface CategoryOption {
  id: string
  name: string
  slug: string
}

interface HeroLinkPickerProps {
  value: string
  onChange: (link: string) => void
  categories: CategoryOption[]
}

const CUSTOM = '__custom__'

// Chooses where the hero "Shop Now" button goes: a store page, a category, or a custom URL
export default function HeroLinkPicker({ value, onChange, categories }: HeroLinkPickerProps) {
  const presets = [
    { value: '/products', label: 'All Products (default)' },
    { value: '/featured', label: 'Featured Collection' },
    { value: '/trending', label: 'Trending Collection' },
    { value: '/best-seller', label: 'Best Sellers' },
    { value: '#catalog', label: 'Products section on the home page' },
    ...[...categories]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: `/category/${c.slug}`, label: `Category: ${c.name}` })),
    { value: '/about', label: 'About Us page' },
    { value: '/contact', label: 'Contact page' }
  ]

  const current = value || '/products'
  const [isCustom, setIsCustom] = useState(!presets.some((p) => p.value === current))

  return (
    <div className="space-y-2">
      <select
        value={isCustom ? CUSTOM : current}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setIsCustom(true)
          } else {
            setIsCustom(false)
            onChange(e.target.value)
          }
        }}
        className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-brand-500"
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
        <option value={CUSTOM}>Custom link…</option>
      </select>

      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/category/live-plants or https://facebook.com/yourpage"
          className="w-full rounded border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500"
        />
      )}
    </div>
  )
}
