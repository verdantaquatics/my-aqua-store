import React from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/utils/supabase/server'
import { getPublicSettings } from '@/utils/settings'
import { CheckCircle2, ShoppingBag, Truck, Printer } from 'lucide-react'
import OrderClaimAccountCard from '@/components/OrderClaimAccountCard'
import Tr from '@/components/Tr'

interface ConfirmProps {
  searchParams: Promise<{ order_id?: string; trx_id?: string }>
}

export const revalidate = 0

export default async function OrderConfirmationPage({ searchParams }: ConfirmProps) {
  const { order_id, trx_id } = await searchParams
  const supabase = createAdminClient()
  const settings = await getPublicSettings()

  if (!order_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md text-center bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-red-500 font-semibold mb-4"><Tr en="Invalid Confirmation Link" bn="অকার্যকর কনফার্মেশন লিংক" /></p>
          <Link href="/" className="inline-block bg-brand-600 px-6 py-2.5 rounded-xl text-white text-xs font-bold hover:bg-brand-500">
            <Tr en="Back to Home" bn="হোমে ফিরে যান" />
          </Link>
        </div>
      </div>
    )
  }

  // Fetch order details
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', order_id)
    .single()

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md text-center bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-red-500 font-semibold mb-4"><Tr en="Order record not found" bn="অর্ডারটি খুঁজে পাওয়া যায়নি" /></p>
          <Link href="/" className="inline-block bg-brand-600 px-6 py-2.5 rounded-xl text-white text-xs font-bold hover:bg-brand-500">
            <Tr en="Back to Home" bn="হোমে ফিরে যান" />
          </Link>
        </div>
      </div>
    )
  }

  // Fetch order items
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('*, products(name)')
    .eq('order_id', order.id)

  const itemsSubtotal = (orderItems || []).reduce((sum: number, it: any) => sum + Number(it.price) * it.quantity, 0)
  const discountAmount = Number(order.discount_amount || 0)
  const deliveryCharge = Number(order.delivery_charge || 0)
  const totalPrice = Number(order.total_price || 0)

  const isPersonal = order.payment_method === 'BKASH_PERSONAL'
  const isCod = order.payment_method === 'COD'
  const isPendingVerification = order.payment_status === 'Pending Verification'

  const customAdvance = order.payment_details?.advance_paid !== undefined
    ? Number(order.payment_details.advance_paid)
    : (isCod ? deliveryCharge : totalPrice)

  const codToCollect = isCod
    ? Math.max(0, totalPrice - (isPendingVerification ? deliveryCharge : customAdvance))
    : 0

  const courierName = order.shipping_provider === 'steadfast' ? 'Steadfast Courier' : 'Pathao Courier'

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="flex-grow flex items-center justify-center p-4 py-16">
        <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 shadow-xl text-center space-y-6">
          
          <div className="flex justify-center">
            <CheckCircle2 className="h-16 w-16 text-brand-600 bg-brand-50 rounded-full p-2" />
          </div>
          
          <div>
            <h1 className="text-2xl font-black text-slate-950"><Tr en="Order Placed Successfully!" bn="অর্ডার সফলভাবে সম্পন্ন হয়েছে!" /></h1>
            <p className="mt-1.5 text-xs text-slate-500"><Tr en={`Thank you for shopping with ${settings.store_name}.`} bn={`${settings.store_name} থেকে কেনাকাটার জন্য ধন্যবাদ।`} /></p>
          </div>

          {/* Transaction Summary Panel */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 text-left text-xs space-y-2.5">
            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500"><Tr en="Order ID:" bn="অর্ডার আইডি:" /></span>
              <span className="font-mono font-bold text-slate-900">#{order.id.slice(0, 8).toUpperCase()}</span>
            </div>

            {order.payment_details?.transaction_id ? (
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500"><Tr en="bKash TrxID:" bn="বিকাশ TrxID:" /></span>
                <span className="font-mono font-bold text-pink-700 uppercase">{order.payment_details.transaction_id}</span>
              </div>
            ) : trx_id ? (
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500"><Tr en="bKash Transaction ID:" bn="বিকাশ ট্রানজেকশন আইডি:" /></span>
                <span className="font-mono font-bold text-slate-900">{trx_id}</span>
              </div>
            ) : null}

            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500"><Tr en="Customer:" bn="গ্রাহক:" /></span>
              <span className="font-bold text-slate-900">{order.customer_name} ({order.customer_phone})</span>
            </div>

            <div className="flex justify-between border-b border-slate-200/60 pb-2">
              <span className="text-slate-500"><Tr en="Payment Method:" bn="পেমেন্ট পদ্ধতি:" /></span>
              <span className="font-bold text-slate-900">
                {isPersonal ? (
                  <span className="text-pink-600"><Tr en="bKash Personal (Send Money)" bn="বিকাশ পার্সোনাল (সেন্ড মানি)" /></span>
                ) : isCod ? (
                  <Tr en="Cash on Delivery (COD)" bn="ক্যাশ অন ডেলিভারি (COD)" />
                ) : (
                  <Tr en="bKash Online Gateway" bn="বিকাশ অনলাইন পেমেন্ট" />
                )}
              </span>
            </div>

            {/* Price Calculations */}
            <div className="space-y-1.5 pt-1 border-b border-slate-200/60 pb-2 text-slate-600">
              <div className="flex justify-between">
                <span><Tr en="Products Subtotal:" bn="পণ্যের মূল্য:" /></span>
                <span>৳{itemsSubtotal.toLocaleString()}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span><Tr en="Promo Discount" bn="প্রোমো ডিসকাউন্ট" /> {order.promo_code ? `(${order.promo_code})` : ''}:</span>
                  <span>-৳{discountAmount.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span><Tr en="Delivery Fee:" bn="ডেলিভারি চার্জ:" /></span>
                <span>৳{deliveryCharge.toLocaleString()}</span>
              </div>

              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200/40">
                <span><Tr en="Total Order Amount:" bn="সর্বমোট অর্ডার মূল্য:" /></span>
                <span>৳{totalPrice.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-sm pt-1">
              <span className="text-slate-900 font-bold">
                {isCod ? <Tr en="Advance Delivery Fee:" bn="অগ্রিম ডেলিভারি চার্জ:" /> : <Tr en="Paid via bKash:" bn="বিকাশে পরিশোধিত:" />}
              </span>
              <div className="text-right">
                <span className="font-black text-brand-700 block">
                  ৳{(isCod ? deliveryCharge : totalPrice).toLocaleString()}
                </span>
                {isPendingVerification && (
                  <span className="text-[10px] text-pink-600 font-bold block">
                    <Tr en="(Pending Verification)" bn="(যাচাইয়ের অপেক্ষায়)" />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Guest Account Claim Card (If guest order) */}
          <OrderClaimAccountCard
            orderId={order.id}
            customerName={order.customer_name}
            customerPhone={order.customer_phone}
            customerEmail={order.customer_email}
            shippingAddress={order.shipping_address}
            cityId={order.city_id}
            zoneId={order.zone_id}
            areaId={order.area_id}
          />

          {/* Order Items Table */}
          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden text-left text-xs">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 font-bold text-slate-800 uppercase tracking-wide text-[10px]">
              <Tr en="Ordered Products" bn="অর্ডারকৃত পণ্য" />
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
                  <th className="px-4 py-2"><Tr en="Item" bn="পণ্য" /></th>
                  <th className="px-4 py-2 text-center"><Tr en="Qty" bn="পরিমাণ" /></th>
                  <th className="px-4 py-2 text-right"><Tr en="Price" bn="মূল্য" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderItems && orderItems.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50/20">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{item.products?.name || 'Product Item'}</p>
                      {item.selected_variations && Object.entries(item.selected_variations as Record<string, any>).map(([k, v]) => (
                        <span key={k} className="inline-block bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] mr-1 mt-1 capitalize">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 font-medium">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-bold">৳{(Number(item.price) * item.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Delivery Note Box */}
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-5 text-left text-xs space-y-2 text-blue-900">
            <div className="flex items-center gap-1.5 font-bold">
              <Truck className="h-4 w-4 text-blue-700" />
              <span><Tr en="Courier Delivery Details:" bn="কুরিয়ার ডেলিভারির তথ্য:" /></span>
            </div>
            {isCod ? (
              <p className="leading-relaxed">
                <Tr
                  en={<>Your order is confirmed and will be dispatched via <strong>{courierName}</strong>. Please keep <strong>৳{codToCollect.toLocaleString()}</strong> cash ready upon doorstep delivery.</>}
                  bn={<>আপনার অর্ডার কনফার্ম হয়েছে এবং <strong>{courierName}</strong>-এর মাধ্যমে পাঠানো হবে। পার্সেল হাতে পাওয়ার সময় <strong>৳{codToCollect.toLocaleString()}</strong> নগদ প্রস্তুত রাখুন।</>}
                />
              </p>
            ) : (
              <p className="leading-relaxed">
                <Tr
                  en={<>Your order is fully prepaid and will be dispatched via <strong>{courierName}</strong>. Your COD balance on delivery is <strong>৳0</strong>.</>}
                  bn={<>আপনার অর্ডারের সম্পূর্ণ মূল্য পরিশোধিত এবং <strong>{courierName}</strong>-এর মাধ্যমে পাঠানো হবে। ডেলিভারির সময় কোনো টাকা দিতে হবে না (<strong>৳0</strong>)।</>}
                />
              </p>
            )}
            
            {order.pathao_consignment_id && (
              <div className="pt-2">
                <span className="font-bold block"><Tr en="Pathao Consignment ID:" bn="পাঠাও কনসাইনমেন্ট আইডি:" /></span>
                <span className="font-mono bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-900 font-bold block w-fit mt-1">
                  {order.pathao_consignment_id}
                </span>
              </div>
            )}

            {order.steadfast_consignment_id && (
              <div className="pt-2 space-y-1">
                <span className="font-bold block"><Tr en="Steadfast Consignment ID:" bn="স্টেডফাস্ট কনসাইনমেন্ট আইডি:" /></span>
                <span className="font-mono bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-900 font-bold block w-fit">
                  {order.steadfast_consignment_id}
                </span>
                {order.steadfast_tracking_code && (
                  <span className="text-[11px] text-blue-700 font-mono block">
                    <Tr en="Tracking Code:" bn="ট্র্যাকিং কোড:" /> {order.steadfast_tracking_code}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-6 py-3 text-xs font-bold text-white shadow hover:bg-slate-800 transition"
            >
              <ShoppingBag className="h-4 w-4" />
              <Tr en="Back to Catalog" bn="কেনাকাটায় ফিরে যান" />
            </Link>

            <a
              href={`/invoice/${order.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-6 py-3 text-xs font-bold text-white shadow hover:bg-brand-500 transition"
            >
              <Printer className="h-4 w-4" />
              <Tr en="View & Print Invoice" bn="ইনভয়েস দেখুন ও প্রিন্ট করুন" />
            </a>
          </div>

        </div>
      </main>
    </div>
  )
}
