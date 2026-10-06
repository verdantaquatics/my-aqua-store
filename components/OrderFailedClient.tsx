'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, PhoneCall, RefreshCw, ShoppingBag, FileText, CheckCircle2, Loader2, ArrowRight } from 'lucide-react'
import { useStore } from '@/context/StoreContext'
import { useLanguage } from '@/context/LanguageContext'
import axios from 'axios'

interface OrderFailedClientProps {
  order: {
    id: string
    customer_name: string
    customer_phone: string
    delivery_charge: number
    total_price: number
    payment_method: string
    payment_status: string
    shipping_address: string
  } | null
  reason?: string
  isRetry?: boolean
}

export default function OrderFailedClient({ order, reason, isRetry }: OrderFailedClientProps) {
  const router = useRouter()
  const { settings } = useStore()
  const { isBangla, toBengaliDigits } = useLanguage()
  const [retrying, setRetrying] = useState(false)
  const [retryFailed, setRetryFailed] = useState(Boolean(isRetry))

  const isCod = order?.payment_method === 'COD'
  const advanceAmount = isCod ? Number(order?.delivery_charge ?? 0) : Number(order?.total_price ?? 0)
  const amountText = isBangla ? toBengaliDigits(advanceAmount.toLocaleString()) : advanceAmount.toLocaleString()

  const handleRetryPayment = async () => {
    if (!order?.id) {
      router.push('/checkout')
      return
    }

    setRetrying(true)
    try {
      const res = await axios.post('/api/bkash', {
        action: 'retry',
        order_id: order.id
      })

      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl
      } else {
        setRetryFailed(true)
      }
    } catch (err) {
      console.error('Failed to initiate payment retry', err)
      setRetryFailed(true)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <main className="flex-grow flex items-center justify-center p-4 py-16">
        <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-2xl space-y-6 text-center animate-fade-in-up">
          
          {/* Top Status Icon */}
          <div className="flex justify-center">
            {retryFailed ? (
              <div className="h-16 w-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <PhoneCall className="h-8 w-8 animate-pulse" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                <AlertTriangle className="h-8 w-8" />
              </div>
            )}
          </div>

          {/* Header & Reassurance message */}
          {retryFailed ? (
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                {isBangla ? 'অর্ডার গৃহীত • কনফার্মেশনের অপেক্ষায়' : 'Order Placed • Support Confirmation Pending'}
              </span>
              <h1 className="text-2xl font-black text-slate-950">{isBangla ? 'কনফার্ম করতে আমরা আপনাকে কল করব!' : 'We Will Call You to Confirm!'}</h1>
              <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                {isBangla ? (
                  <>চিন্তা করবেন না! আপনার অর্ডারের তথ্য সংরক্ষিত হয়েছে। <strong className="text-slate-900">{settings.store_name}</strong>-এর একজন প্রতিনিধি শীঘ্রই <strong className="text-brand-600 font-mono">{order?.customer_phone || 'আপনার নম্বরে'}</strong> কল করে অর্ডার কনফার্ম ও হোম ডেলিভারির ব্যবস্থা করবেন।</>
                ) : (
                  <>Don&apos;t worry! Your order details have been saved in our system. A customer service representative from <strong className="text-slate-900">{settings.store_name}</strong> will call you shortly at <strong className="text-brand-600 font-mono">{order?.customer_phone || 'your phone'}</strong> to confirm your order and arrange doorstep delivery.</>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                {isBangla ? 'অগ্রিম পেমেন্ট সম্পন্ন হয়নি' : 'Advance Payment Incomplete'}
              </span>
              <h1 className="text-2xl font-black text-slate-950">{isBangla ? 'পেমেন্ট বাতিল হয়েছে' : 'Payment Was Cancelled'}</h1>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                {isBangla
                  ? `আপনার অর্ডার সংরক্ষিত আছে, কিন্তু অগ্রিম ${isCod ? 'ডেলিভারি চার্জ' : 'পেমেন্ট'} ৳${amountText} পরিশোধ সম্পন্ন হয়নি। ডেলিভারি কনফার্ম করতে আবার পেমেন্ট করুন।`
                  : `Your order is saved, but the advance ${isCod ? 'delivery charge' : 'order payment'} of ৳${amountText} was not completed. Please try paying again to confirm your delivery immediately.`}
              </p>
            </div>
          )}

          {/* Order Summary Box */}
          {order && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-left text-xs space-y-2.5">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-medium">{isBangla ? 'অর্ডার আইডি:' : 'Order ID:'}</span>
                <span className="font-mono font-bold text-slate-900">{order.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">{isBangla ? 'গ্রাহক:' : 'Customer:'}</span>
                <span className="font-bold text-slate-900">{order.customer_name} ({order.customer_phone})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">{isBangla ? 'পেমেন্ট পদ্ধতি:' : 'Payment Method:'}</span>
                <span className="font-bold text-slate-900">{order.payment_method}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold">
                <span className="text-slate-700">
                  {isCod
                    ? (isBangla ? 'বকেয়া অগ্রিম ডেলিভারি চার্জ:' : 'Advance Delivery Charge Due:')
                    : (isBangla ? 'মোট বকেয়া:' : 'Total Amount Due:')}
                </span>
                <span className="text-sm font-black text-brand-600">৳{amountText}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            {!retryFailed ? (
              <>
                <button
                  onClick={handleRetryPayment}
                  disabled={retrying}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-xs font-bold text-white shadow-lg hover:bg-brand-500 transition disabled:bg-slate-300"
                >
                  {retrying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{isBangla ? 'বিকাশে সংযোগ করা হচ্ছে...' : 'Connecting to bKash...'}</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span>{isBangla ? `বিকাশে ৳${amountText} অগ্রিম পরিশোধ করুন` : `Pay ৳${amountText} Advance with bKash`}</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setRetryFailed(true)}
                  className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800 transition py-1"
                >
                  {isBangla ? 'এখন অনলাইনে পরিশোধ করতে পারছি না (আমাকে কল করুন)' : 'I cannot pay online right now (Call me instead)'}
                </button>
              </>
            ) : (
              <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3 text-left">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-emerald-950">{isBangla ? 'আপনার অর্ডারটি আমরা নোট করেছি!' : 'We have noted your order!'}</p>
                  <p className="text-emerald-700 mt-0.5">
                    {isBangla
                      ? 'অনুগ্রহ করে আপনার ফোন চালু রাখুন। নিচের ইনভয়েস লিংক থেকে যেকোনো সময় অর্ডারের বিবরণ দেখতে পারবেন।'
                      : 'Please keep your phone active. You can inspect your order summary anytime using the invoice link below.'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {order && (
                <Link
                  href={`/invoice/${order.id}`}
                  target="_blank"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition"
                >
                  <FileText className="h-4 w-4 text-brand-600" />
                  <span>{isBangla ? 'অর্ডার ইনভয়েস দেখুন' : 'View Order Invoice'}</span>
                </Link>
              )}
              <Link
                href="/"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>{isBangla ? 'কেনাকাটা চালিয়ে যান' : 'Continue Shopping'}</span>
              </Link>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
