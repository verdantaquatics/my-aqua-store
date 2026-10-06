import { createAdminClient } from '@/utils/supabase/server'
import { getPublicSettings } from '@/utils/settings'
import { formatOrderNumber } from '@/utils/order-number'
import { notFound } from 'next/navigation'
import InvoiceClient from './InvoiceClient'

export const revalidate = 0

interface InvoicePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: InvoicePageProps) {
  const { id } = await params
  const settings = await getPublicSettings()
  const shortId = formatOrderNumber(id)
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

  // Only pass what the invoice renders: this object is serialized to the browser
  const { user_id, customer_id, payment_details, ...invoiceOrder } = order
  const safeOrder = {
    ...invoiceOrder,
    payment_details: {
      advance_paid: payment_details?.advance_paid,
      shipping_metadata: payment_details?.shipping_metadata,
      transaction_id: payment_details?.transaction_id,
      trx_id: payment_details?.trx_id
    }
  }

  return <InvoiceClient order={safeOrder} settings={settings} />
}
