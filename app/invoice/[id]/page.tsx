import { createAdminClient } from '@/utils/supabase/server'
import { getPublicSettings } from '@/utils/settings'
import { notFound } from 'next/navigation'
import InvoiceClient from './InvoiceClient'

export const revalidate = 0

interface InvoicePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: InvoicePageProps) {
  const { id } = await params
  const settings = await getPublicSettings()
  const shortId = id.slice(0, 8).toUpperCase()
  return {
    title: `Invoice-${shortId} - ${settings.store_name}`,
    description: `Official order invoice #${shortId} from ${settings.store_name}`
  }
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params
  const supabase = createAdminClient()
  const settings = await getPublicSettings()

  // Fetch Order and associated items
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*, products(name, images))')
    .eq('id', id)
    .single()

  if (error || !order) {
    notFound()
  }

  return <InvoiceClient order={order} settings={settings} />
}
