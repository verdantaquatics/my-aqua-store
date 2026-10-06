import { getPublicSettings } from '@/utils/settings'
import AboutPageClient from '@/components/AboutPageClient'
import type { Metadata } from 'next'

// Cached and served from the CDN; refreshed every 5 minutes and on settings changes
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings()
  return {
    title: `About Us - ${settings.store_name}`,
    description: settings.about_story?.slice(0, 160) || `Learn more about ${settings.store_name} and our mission.`
  }
}

export default function AboutPage() {
  return <AboutPageClient />
}
