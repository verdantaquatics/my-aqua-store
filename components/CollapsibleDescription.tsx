'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

// About 10 lines of body text before the description is collapsed
const COLLAPSED_HEIGHT_PX = 230

interface CollapsibleDescriptionProps {
  html?: string
  text?: string
}

/**
 * Long product descriptions are clipped with a fade and a "Show full description"
 * toggle. Short ones render normally with no button.
 */
export default function CollapsibleDescription({ html, text }: CollapsibleDescriptionProps) {
  const { isBangla } = useLanguage()
  const contentRef = useRef<HTMLDivElement>(null)
  const [isLong, setIsLong] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => setIsLong(el.scrollHeight > COLLAPSED_HEIGHT_PX + 40)
    measure()
    // Re-measure when the layout width changes or images inside the description load
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [html, text])

  const collapsed = isLong && !expanded

  return (
    <div className="pt-4 border-t border-slate-200">
      <div className="relative">
        <div
          ref={contentRef}
          className="overflow-hidden transition-[max-height] duration-300"
          style={{ maxHeight: collapsed ? COLLAPSED_HEIGHT_PX : undefined }}
        >
          {html ? (
            <div
              className="prose prose-sm max-w-none text-slate-600 leading-relaxed font-normal"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{text}</p>
          )}
        </div>

        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-50 via-slate-50/80 to-transparent" />
        )}
      </div>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-700 hover:border-brand-300 hover:bg-brand-50 transition"
        >
          {expanded ? (
            <>
              {isBangla ? 'সংক্ষেপে দেখুন' : 'Show less'} <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              {isBangla ? 'সম্পূর্ণ বিবরণ দেখুন' : 'Show full description'} <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  )
}
