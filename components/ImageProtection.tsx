'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useStore } from '@/context/StoreContext'

/**
 * Deters casual copying of storefront images: blocks the right-click menu and
 * dragging on images/videos, and (via the `protect-images` CSS class) the mobile
 * long-press "Save image" menu. Not active in the dashboard.
 *
 * Note: anything shown in a browser can still be captured (screenshots, dev
 * tools), so the watermark remains the real protection.
 */
export default function ImageProtection() {
  const { settings } = useStore()
  const pathname = usePathname()
  const enabled = settings.protect_images !== false && !pathname?.startsWith('/stradmn')

  useEffect(() => {
    if (!enabled) return

    const isMedia = (target: EventTarget | null) =>
      target instanceof HTMLImageElement || target instanceof HTMLVideoElement

    const block = (e: Event) => {
      if (isMedia(e.target)) e.preventDefault()
    }

    document.body.classList.add('protect-images')
    document.addEventListener('contextmenu', block)
    document.addEventListener('dragstart', block)

    return () => {
      document.body.classList.remove('protect-images')
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('dragstart', block)
    }
  }, [enabled])

  return null
}
