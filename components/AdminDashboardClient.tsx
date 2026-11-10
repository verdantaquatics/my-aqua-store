'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  TrendingUp, Users, DollarSign, Package, CheckCircle2,
  AlertCircle, Clock, Truck, Search, LogOut, ArrowUpRight,
  RefreshCw, Play, Edit2, FileText, ChevronRight, MessageSquare, Trash2, Mail, Phone,
  XCircle, Check, Minus, Plus, ArrowUpDown, ArrowUp, ArrowDown, Copy, Smartphone, ShieldCheck, Loader2
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/context/StoreContext'
import { useLanguage } from '@/context/LanguageContext'
import AdminSidebar from '@/components/AdminSidebar'
import { canEditOrderItems, orderHoldsStock } from '@/utils/order-stock'
import axios from 'axios'

interface OrderItem {
  id: string
  product_id?: string
  quantity: number
  price: number
  selected_variations?: Record<string, string>
  products?: { name: string }
}

interface Order {
  id: string
  customer_name: string
  customer_phone: string
  customer_email: string | null
  shipping_address: string
  shipping_provider?: string | null
  city_id: number
  zone_id: number
  area_id: number
  delivery_charge: number
  total_price: number
  discount_amount?: number
  promo_code?: string | null
  promo_code_id?: string | null
  payment_method: string
  payment_status: string
  order_status?: string
  payment_details: any
  pathao_consignment_id: string | null
  pathao_status: string | null
  steadfast_consignment_id?: string | null
  steadfast_tracking_code?: string | null
  created_at: string
  order_items?: OrderItem[]
}

interface ContactMessage {
  id: string
  name: string
  phone: string
  email: string | null
  subject: string | null
  message: string
  is_read: boolean
  created_at: string
}

interface DashboardProps {
  initialOrders: Order[]
}

interface EditableItem {
  id: string // for products added in this edit: a temporary "new-..." id
  product_id?: string
  name: string
  quantity: number
  originalQuantity: number // 0 for products added in this edit
  price: number
  selected_variations?: Record<string, string>
  isNew?: boolean
}

// A product found with "Add product" in the Edit Order window
interface PickerProduct {
  id: string
  name: string
  price: number
  stock: number
  variations: any
  images?: string[]
  is_hidden?: boolean
}

type PickerOption = { name: string; values: { label: string; stock?: number; price?: number }[] }

// Same reading of product variations as checkout (utils/order-pricing.ts)
function pickerOptions(variations: any): PickerOption[] {
  if (!variations || typeof variations !== 'object' || !Array.isArray(variations.options)) return []
  return variations.options
    .filter((opt: any) => opt && Array.isArray(opt.values) && opt.values.length > 0)
    .map((opt: any) => ({
      name: String(opt.name || 'Option'),
      values: opt.values.map((v: any) => ({
        label: String(v?.label ?? v),
        stock: typeof v?.stock === 'number' ? v.stock : undefined,
        price: v?.price !== undefined && v?.price !== null && v?.price !== '' ? Number(v.price) : undefined
      }))
    }))
}

function pickerVariant(product: PickerProduct, chosen: Record<string, string>) {
  let price = Number(product.price) || 0
  let stock = Number(product.stock) || 0
  let minStock = Infinity
  let complete = true
  for (const opt of pickerOptions(product.variations)) {
    const value = opt.values.find((v) => v.label === chosen[opt.name])
    if (!value) { complete = false; continue }
    if (value.price !== undefined && value.price > 0) price = value.price
    if (typeof value.stock === 'number') minStock = Math.min(minStock, value.stock)
  }
  if (minStock !== Infinity) stock = minStock
  return { price, stock, complete }
}

const sameVariations = (a?: Record<string, string> | null, b?: Record<string, string> | null) =>
  JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort())

export default function AdminDashboardClient({ initialOrders }: DashboardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { settings } = useStore()
  const { t, toBengaliDigits, isBangla } = useLanguage()
  
  const [activeTab, setActiveTab] = useState<'orders' | 'messages'>(() => {
    return searchParams.get('tab') === 'messages' ? 'messages' : 'orders'
  })
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Pagination States
  const [pageSize, setPageSize] = useState<number>(20)
  const [currentPage, setCurrentPage] = useState<number>(1)

  useEffect(() => {
    if (searchParams.get('tab') === 'messages') {
      setActiveTab('messages')
    } else if (searchParams.get('tab') === 'orders') {
      setActiveTab('orders')
    }
  }, [searchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // Edit Order Modal States
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editZone, setEditZone] = useState('')
  const [editArea, setEditArea] = useState('')
  const [editDeliveryCharge, setEditDeliveryCharge] = useState(0)
  const [editOrderStatus, setEditOrderStatus] = useState('Pending')
  const [editPaymentStatus, setEditPaymentStatus] = useState('Pending')
  const [editAdvancePaid, setEditAdvancePaid] = useState(0)
  const [editDiscountAmount, setEditDiscountAmount] = useState(0)
  const [editItems, setEditItems] = useState<EditableItem[]>([])
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([])
  const [notifyCustomer, setNotifyCustomer] = useState(true)
  const [restockRemoved, setRestockRemoved] = useState(false)

  // "Add product" picker in the Edit Order window
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerResults, setPickerResults] = useState<PickerProduct[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerProduct, setPickerProduct] = useState<PickerProduct | null>(null)
  const [pickerChoice, setPickerChoice] = useState<Record<string, string>>({})
  const [pickerQty, setPickerQty] = useState(1)

  const [locationCities, setLocationCities] = useState<any[]>([])
  const [locationZones, setLocationZones] = useState<any[]>([])
  const [locationAreas, setLocationAreas] = useState<any[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

  // Courier Dispatch Confirmation Modal State
  const [dispatchConfirm, setDispatchConfirm] = useState<{
    order: Order
    provider: 'pathao' | 'steadfast' | 'manual'
  } | null>(null)

  // Delete Order Confirmation Modal State
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<Order | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [emailingOrderId, setEmailingOrderId] = useState<string | null>(null)

  // Column Sorting State
  const [sortField, setSortField] = useState<'date' | 'customer' | 'status' | 'payment' | 'amount' | 'courier'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Fetch Contact Messages
  const loadMessages = async () => {
    setLoadingMessages(true)
    try {
      const res = await axios.get('/api/contact')
      if (Array.isArray(res.data)) {
        setMessages(res.data)
      }
    } catch (err) {
      console.error('Failed to load contact messages', err)
    } finally {
      setLoadingMessages(false)
    }
  }

  useEffect(() => {
    loadMessages()
  }, [])

  // Fetch Cities on Mount for editing
  useEffect(() => {
    async function loadCities() {
      try {
        const response = await fetch('/api/pathao?action=cities')
        const data = await response.json()
        if (Array.isArray(data)) setLocationCities(data)
      } catch (err) {
        console.error('Failed to load cities', err)
      }
    }
    loadCities()
  }, [])

  // Fetch Zones when editCity changes
  useEffect(() => {
    if (!editCity) {
      setLocationZones([])
      setLocationAreas([])
      return
    }
    if (editingOrder && String(editingOrder.city_id) === String(editCity) && locationZones.length > 0) {
      return
    }

    async function loadZones() {
      setLoadingLocations(true)
      try {
        const response = await fetch(`/api/pathao?city_id=${editCity}`)
        const data = await response.json()
        if (Array.isArray(data)) setLocationZones(data)
      } catch (err) {
        console.error('Failed to load zones', err)
      } finally {
        setLoadingLocations(false)
      }
    }
    loadZones()
  }, [editCity, editingOrder, locationZones.length])

  // Fetch Areas when editZone changes
  useEffect(() => {
    if (!editZone) {
      setLocationAreas([])
      return
    }
    if (editingOrder && String(editingOrder.zone_id) === String(editZone) && locationAreas.length > 0) {
      return
    }

    async function loadAreas() {
      setLoadingLocations(true)
      try {
        const response = await fetch(`/api/pathao?zone_id=${editZone}`)
        const data = await response.json()
        if (Array.isArray(data)) setLocationAreas(data)
      } catch (err) {
        console.error('Failed to load areas', err)
      } finally {
        setLoadingLocations(false)
      }
    }
    loadAreas()
  }, [editZone, editingOrder, locationAreas.length])

  // Open Full Order Edit Modal
  const openEditModal = async (order: Order) => {
    setEditingOrder(order)
    setEditName(order.customer_name)
    setEditPhone(order.customer_phone)
    setEditEmail(order.customer_email || '')
    setEditAddress(order.shipping_address)
    setEditCity(order.city_id ? String(order.city_id) : '')
    setEditZone(order.zone_id ? String(order.zone_id) : '')
    setEditArea(order.area_id ? String(order.area_id) : '')
    setEditDeliveryCharge(Number(order.delivery_charge || 0))
    setEditOrderStatus(order.order_status || 'Pending')
    setEditPaymentStatus(order.payment_status || 'Pending')
    
    // Set initial advance paid
    const initialAdvance = order.payment_details?.advance_paid !== undefined
      ? Number(order.payment_details.advance_paid)
      : order.payment_status === 'FullyPaid'
        ? Number(order.total_price)
        : order.payment_status === 'DeliveryChargePrePaid'
          ? Number(order.delivery_charge)
          : 0
    setEditAdvancePaid(initialAdvance)
    setEditDiscountAmount(Number(order.discount_amount || 0))
    setDeletedItemIds([])
    setNotifyCustomer(true)
    setRestockRemoved(false)
    closeProductPicker()

    // Populate editable items
    const itemsList: EditableItem[] = (order.order_items || []).map((it) => ({
      id: it.id,
      product_id: it.product_id,
      name: it.products?.name || 'Product Item',
      quantity: it.quantity,
      originalQuantity: it.quantity,
      price: Number(it.price),
      selected_variations: it.selected_variations
    }))
    setEditItems(itemsList)

    if (order.city_id) {
      try {
        const resZones = await fetch(`/api/pathao?city_id=${order.city_id}`)
        const dataZones = await resZones.json()
        if (Array.isArray(dataZones)) setLocationZones(dataZones)
      } catch (e) {
        console.error(e)
      }
    }

    if (order.zone_id) {
      try {
        const resAreas = await fetch(`/api/pathao?zone_id=${order.zone_id}`)
        const dataAreas = await resAreas.json()
        if (Array.isArray(dataAreas)) setLocationAreas(dataAreas)
      } catch (e) {
        console.error(e)
      }
    }
  }

  // Handle Item Quantity Stepper in Edit Modal
  const handleItemQtyChange = (index: number, delta: number) => {
    setEditItems((prev) => {
      const next = [...prev]
      const currentQty = next[index].quantity || 1
      const updatedQty = Math.max(1, currentQty + delta)
      next[index] = { ...next[index], quantity: updatedQty }
      return next
    })
  }

  // Handle Item Removal in Edit Modal
  const handleRemoveItem = (index: number) => {
    // An order must keep at least one item; to drop everything, cancel the order
    if (editItems.length <= 1) return
    const itemToRemove = editItems[index]
    // Products added in this edit aren't saved yet, so there's nothing to delete
    if (itemToRemove?.id && !itemToRemove.isNew) {
      setDeletedItemIds((prev) => [...prev, itemToRemove.id])
    }
    setEditItems((prev) => prev.filter((_, i) => i !== index))
  }

  // "Add product" picker
  const closeProductPicker = () => {
    setPickerOpen(false)
    setPickerSearch('')
    setPickerResults([])
    setPickerProduct(null)
    setPickerChoice({})
    setPickerQty(1)
  }

  useEffect(() => {
    if (!pickerOpen || pickerProduct) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setPickerLoading(true)
      try {
        const res = await fetch(`/api/admin/products?search=${encodeURIComponent(pickerSearch.trim())}`)
        const json = await res.json()
        if (!cancelled) setPickerResults(Array.isArray(json.data) ? json.data : [])
      } catch (err) {
        console.error(err)
        if (!cancelled) setPickerResults([])
      } finally {
        if (!cancelled) setPickerLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pickerOpen, pickerSearch, pickerProduct])

  const choosePickerProduct = (product: PickerProduct) => {
    setPickerProduct(product)
    setPickerQty(1)
    // Preselect the first value of each option to save clicks
    const initial: Record<string, string> = {}
    pickerOptions(product.variations).forEach((opt) => {
      if (opt.values[0]) initial[opt.name] = opt.values[0].label
    })
    setPickerChoice(initial)
  }

  const handleAddPickedProduct = () => {
    if (!pickerProduct) return
    const variant = pickerVariant(pickerProduct, pickerChoice)
    if (!variant.complete) return
    const qty = Math.max(1, Math.floor(pickerQty) || 1)
    const chosen = pickerOptions(pickerProduct.variations).length > 0 ? { ...pickerChoice } : {}

    setEditItems((prev) => {
      // Already in the order with the same options -> just raise that line's quantity
      const existingIndex = prev.findIndex(
        (it) => it.product_id === pickerProduct.id && sameVariations(it.selected_variations, chosen)
      )
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + qty }
        return next
      }
      return [
        ...prev,
        {
          id: `new-${pickerProduct.id}-${Date.now()}`,
          product_id: pickerProduct.id,
          name: pickerProduct.name,
          quantity: qty,
          originalQuantity: 0,
          price: variant.price,
          selected_variations: chosen,
          isNew: true
        }
      ]
    })
    closeProductPicker()
  }

  // Save Order Changes
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrder) return
    setSaveLoading(true)

    try {
      const cityName = locationCities.find((c) => String(c.city_id) === String(editCity))?.city_name || ''
      const zoneName = locationZones.find((z) => String(z.zone_id) === String(editZone))?.zone_name || ''
      const areaName = locationAreas.find((a) => String(a.area_id) === String(editArea))?.area_name || ''

      const response = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingOrder.id,
          customer_name: editName,
          customer_phone: editPhone,
          customer_email: editEmail || null,
          shipping_address: editAddress,
          city_id: Number(editCity || 0),
          zone_id: Number(editZone || 0),
          area_id: Number(editArea || 0),
          city_name: cityName,
          zone_name: zoneName,
          area_name: areaName,
          delivery_charge: editDeliveryCharge,
          order_status: editOrderStatus,
          payment_status: editPaymentStatus,
          advance_paid: editAdvancePaid,
          discount_amount: editDiscountAmount,
          items: editItems.filter((it) => !it.isNew).map((it) => ({
            id: it.id,
            quantity: it.quantity,
            price: it.price
          })),
          deleted_item_ids: deletedItemIds,
          added_items: editItems.filter((it) => it.isNew).map((it) => ({
            product_id: it.product_id,
            quantity: it.quantity,
            selected_variations: it.selected_variations || {}
          })),
          notify_customer: notifyCustomer && orderItemsOrTotalChanged,
          restock_removed: restockRemoved
        })
      })

      const resJson = await response.json()
      if (!response.ok) {
        throw new Error(resJson.error || 'Failed to update order details.')
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === editingOrder.id ? resJson.data : o))
      )
      setEditingOrder(null)

      // Let the owner know whether the customer was emailed, and about courier follow-ups
      const notes: string[] = []
      if (resJson.customerEmail?.sent) {
        notes.push(`Order updated. The customer was emailed the updated order at ${resJson.data?.customer_email}.`)
      } else if (resJson.customerEmail && !resJson.customerEmail.sent) {
        notes.push(`Order updated, but the customer email was not sent: ${resJson.customerEmail.reason}`)
      }
      if (Array.isArray(resJson.warnings)) notes.push(...resJson.warnings)
      if (notes.length > 0) alert(notes.join('\n\n'))
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Error saving order changes.')
    } finally {
      setSaveLoading(false)
    }
  }

  // Quick Order Status Change (e.g. Accept / Decline)
  const handleQuickStatusChange = async (orderId: string, newStatus: string) => {
    setActionLoading(orderId)
    try {
      const targetOrder = orders.find((o) => o.id === orderId)
      if (!targetOrder) return

      const response = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          customer_name: targetOrder.customer_name,
          customer_phone: targetOrder.customer_phone,
          shipping_address: targetOrder.shipping_address,
          order_status: newStatus
        })
      })

      const resJson = await response.json()
      if (resJson.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? (resJson.data || { ...o, order_status: newStatus }) : o))
        )
        // e.g. accepting an order that asks for more units than are in stock
        if (Array.isArray(resJson.warnings) && resJson.warnings.length > 0) {
          alert(resJson.warnings.join('\n\n'))
        }
      } else {
        alert(resJson.error || 'Failed to update status')
      }
    } catch (err) {
      console.error(err)
      alert('Error updating order status')
    } finally {
      setActionLoading(null)
    }
  }

  // Copy text helper
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const handleCopyText = (text: string, label: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedText(`${label}-${text}`)
    setTimeout(() => setCopiedText(null), 2500)
  }

  // Quick Verify bKash Personal Payment & Confirm Order
  const handleVerifyBkashPayment = async (order: Order, isVerified: boolean) => {
    const isCod = order.payment_method === 'COD'
    let newPaymentStatus: string
    let advancePaid = 0

    if (isVerified) {
      if (isCod) {
        newPaymentStatus = 'DeliveryChargePrePaid'
        advancePaid = Number(order.payment_details?.advance_paid || order.delivery_charge)
      } else {
        newPaymentStatus = 'FullyPaid'
        advancePaid = Number(order.total_price)
      }
    } else {
      newPaymentStatus = 'Failed'
      advancePaid = 0
    }

    const newOrderStatus = isVerified && (order.order_status === 'Pending' || !order.order_status)
      ? 'Confirmed'
      : order.order_status || 'Pending'

    setActionLoading(order.id)
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          customer_email: order.customer_email,
          shipping_address: order.shipping_address,
          payment_status: newPaymentStatus,
          order_status: newOrderStatus,
          advance_paid: advancePaid
        })
      })

      const resJson = await response.json()
      if (resJson.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? (resJson.data || { ...o, payment_status: newPaymentStatus, order_status: newOrderStatus }) : o))
        )
        if (Array.isArray(resJson.warnings) && resJson.warnings.length > 0) {
          alert(resJson.warnings.join('\n\n'))
        }

        // Automatically trigger invoice email when payment is verified
        if (isVerified && order.customer_email) {
          fetch('/api/email/invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: order.id })
          }).catch(console.error)
        }
      } else {
        alert(resJson.error || 'Failed to update bKash payment status')
      }
    } catch (err) {
      console.error(err)
      alert('Error updating bKash payment status')
    } finally {
      setActionLoading(null)
    }
  }

  // Manually trigger or resend invoice email
  const handleSendInvoiceEmail = async (order: Order) => {
    if (!order.customer_email) {
      alert('No customer email address on file for this order.')
      return
    }

    setEmailingOrderId(order.id)
    try {
      const res = await fetch('/api/email/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        alert(`Invoice email successfully sent to ${order.customer_email}!`)
      } else {
        alert(`Email sending issue: ${data.error || data.message || 'Unknown error'}`)
      }
    } catch (err: any) {
      alert(`Failed to send email: ${err.message}`)
    } finally {
      setEmailingOrderId(null)
    }
  }

  // Toggle Message Read Status
  const handleToggleMessageRead = async (msg: ContactMessage) => {
    const nextRead = !msg.is_read
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: nextRead } : m))

    try {
      await axios.patch('/api/contact', { id: msg.id, is_read: nextRead })
    } catch (err) {
      console.error('Failed to update message status', err)
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, is_read: !nextRead } : m))
    }
  }

  // Delete Message
  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return
    setMessages((prev) => prev.filter((m) => m.id !== msgId))

    try {
      await axios.patch('/api/contact', { id: msgId, action: 'delete' })
    } catch (err) {
      console.error('Failed to delete message', err)
      loadMessages()
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/stradmn/login')
    router.refresh()
  }

  // Live Courier Status Sync
  const [syncingCourier, setSyncingCourier] = useState<string | null>(null) // 'bulk' or orderId
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const handleSyncCourierStatus = async (orderId?: string) => {
    setSyncingCourier(orderId || 'bulk')
    setSyncMessage(null)

    try {
      const payload = orderId ? { order_id: orderId } : { bulk: true }
      const res = await axios.post('/api/admin/courier-sync', payload)

      if (res.data?.success) {
        const results = res.data.results as any[]
        if (results && results.length > 0) {
          // Update orders state with any modified order statuses
          setOrders((prev) =>
            prev.map((ord) => {
              const matched = results.find((r: any) => r.order_id === ord.id)
              if (matched && matched.new_order_status) {
                return { ...ord, order_status: matched.new_order_status }
              }
              return ord
            })
          )

          const firstResult = results[0]
          if (orderId) {
            setSyncMessage(
              firstResult.error 
                ? `Courier Note: ${firstResult.error}` 
                : `Live Courier Status: ${firstResult.raw_status ? firstResult.raw_status.toUpperCase() : 'Active'} → Order marked as ${firstResult.new_order_status}`
            )
          } else {
            const updatedCount = results.filter((r: any) => r.status_changed).length
            setSyncMessage(`Synced ${results.length} order(s). ${updatedCount} status(es) automatically updated!`)
          }
          setTimeout(() => setSyncMessage(null), 6000)
        } else {
          setSyncMessage(res.data.message || 'No booked orders found to sync.')
          setTimeout(() => setSyncMessage(null), 4000)
        }
      } else {
        alert(res.data?.error || 'Failed to sync courier status')
      }
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.error || err.message || 'Error checking courier status')
    } finally {
      setSyncingCourier(null)
    }
  }

  // Calculate statistics
  const paidOrders = orders.filter(
    (o) => o.payment_status === 'FullyPaid' || o.payment_status === 'DeliveryChargePrePaid'
  )

  const totalSalesCount = paidOrders.length
  const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_price), 0)
  
  // Pending orders count for badge
  const pendingOrdersCount = orders.filter((o) => (o.order_status || 'Pending') === 'Pending').length

  // Filter orders by search query
  const filteredOrders = orders.filter((o) => {
    const query = searchQuery.toLowerCase()
    return (
      o.id.toLowerCase().includes(query) ||
      o.customer_name.toLowerCase().includes(query) ||
      o.customer_phone.includes(query) ||
      o.shipping_address.toLowerCase().includes(query) ||
      (o.order_status || 'Pending').toLowerCase().includes(query)
    )
  })

  // Toggle sorting column
  const handleSort = (field: 'date' | 'customer' | 'status' | 'payment' | 'amount' | 'courier') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Sorted list
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let cmp = 0
    if (sortField === 'date') {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    } else if (sortField === 'customer') {
      cmp = a.customer_name.localeCompare(b.customer_name)
    } else if (sortField === 'status') {
      cmp = (a.order_status || 'Pending').localeCompare(b.order_status || 'Pending')
    } else if (sortField === 'payment') {
      cmp = (a.payment_status || 'Pending').localeCompare(b.payment_status || 'Pending')
    } else if (sortField === 'amount') {
      cmp = Number(a.total_price) - Number(b.total_price)
    } else if (sortField === 'courier') {
      const courierA = a.steadfast_consignment_id || a.pathao_consignment_id || a.shipping_provider || ''
      const courierB = b.steadfast_consignment_id || b.pathao_consignment_id || b.shipping_provider || ''
      cmp = courierA.localeCompare(courierB)
    }
    return sortDirection === 'asc' ? cmp : -cmp
  })

  // Delete Order Handler
  const handleDeleteOrder = async (orderId: string) => {
    setDeleteLoading(true)
    try {
      const res = await axios.delete(`/api/admin/orders?id=${orderId}`)
      if (res.data?.success) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId))
        setDeleteConfirmOrder(null)
      } else {
        alert(res.data?.error || 'Failed to delete order')
      }
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.error || 'Failed to delete order')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Courier consignment trigger with confirmation
  const handleExecuteDispatch = async (orderId: string, provider: 'pathao' | 'steadfast' | 'manual') => {
    setActionLoading(orderId)
    try {
      const response = await fetch('/api/admin/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, provider })
      })
      const data = await response.json()
      
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === orderId) {
              if (data.provider === 'steadfast') {
                return {
                  ...o,
                  shipping_provider: 'steadfast',
                  steadfast_consignment_id: data.consignment_id,
                  steadfast_tracking_code: data.tracking_code,
                  pathao_status: 'dispatched',
                  order_status: 'Shipped'
                }
              } else if (data.provider === 'manual') {
                return {
                  ...o,
                  shipping_provider: 'manual',
                  pathao_status: 'dispatched',
                  order_status: 'Shipped'
                }
              }
              return {
                ...o,
                shipping_provider: 'pathao',
                pathao_consignment_id: data.consignment_id,
                pathao_status: 'dispatched',
                order_status: 'Shipped'
              }
            }
            return o
          })
        )
        setDispatchConfirm(null)
        if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          alert(data.warnings.join('\n\n'))
        }
      } else {
        alert(data.error || 'Courier booking failed.')
      }
    } catch (err) {
      console.error(err)
      alert('Error triggering courier dispatch.')
    } finally {
      setActionLoading(null)
    }
  }

  // Live Calculations in Edit Modal
  const modalSubtotal = editItems.reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 1), 0)
  const modalDiscount = Math.max(0, Number(editDiscountAmount) || 0)
  const modalTotalPrice = Math.max(0, modalSubtotal + editDeliveryCharge - modalDiscount)
  const modalItemsChanged = deletedItemIds.length > 0 || editItems.some((it) => it.quantity !== it.originalQuantity)
  const modalItemsReduced = deletedItemIds.length > 0 || editItems.some((it) => it.quantity < it.originalQuantity)
  const orderItemsOrTotalChanged = !!editingOrder && (
    modalItemsChanged || Math.abs(modalTotalPrice - Number(editingOrder.total_price || 0)) >= 0.01
  )
  // Items can be changed until the order ships; restocking only matters if the order holds stock
  const canEditItems = !!editingOrder && canEditOrderItems(editingOrder.order_status)
  const editingOrderHoldsStock = !!editingOrder && orderHoldsStock(editingOrder)
  const editingOrderHasConsignment =!!(editingOrder?.pathao_consignment_id || editingOrder?.steadfast_consignment_id)
  const modalAdvancePaid = editAdvancePaid
  const modalDueOnDelivery = Math.max(0, modalTotalPrice - editAdvancePaid)

  // Pagination Calculations
  const totalPages = Math.ceil(sortedOrders.length / pageSize) || 1
  const paginatedOrders = sortedOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-100 text-slate-800">
      
      {/* UNIFIED SIDEBAR NAVIGATION */}
      <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-sm sm:text-lg font-bold text-slate-900 truncate">
              {activeTab === 'orders' 
                ? (isBangla ? 'অর্ডার ও ডেলিভারি ব্যবস্থাপনা' : 'Orders & Fulfillment') 
                : (isBangla ? 'গ্রাহক বার্তা ও জিজ্ঞাসা' : 'Customer Messages')}
            </h1>
            {activeTab === 'orders' && pendingOrdersCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-amber-500 text-white animate-pulse">
                {isBangla ? `${toBengaliDigits(pendingOrdersCount)} নতুন` : `${pendingOrdersCount} New`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-brand-600 border border-slate-200 hover:border-brand-200 px-3 py-1.5 rounded-lg bg-white shadow-sm transition"
            >
              <span>{isBangla ? 'স্টোরফ্রন্ট দেখুন' : 'View Storefront'}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 border border-red-100 hover:border-red-200 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">{t('admin.logout')}</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="p-3.5 sm:p-6 space-y-4 sm:space-y-6 flex-1 overflow-y-auto">
          
          {/* Access Restricted Notice */}
          {searchParams.get('notice') === 'access_restricted' && (
            <div className="flex items-center gap-2 p-3.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs font-semibold animate-fadeIn">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span>{isBangla ? 'অনুমতি নেই: আর্থিক পরিসংখ্যান, স্টোর সেটিংস ও কর্মী ব্যবস্থাপনা কেবল অ্যাডমিন এবং ওনারদের জন্য উন্মুক্ত।' : 'Access Restricted: Financial statistics, store settings, and staff management are only accessible to Admins and Shop Owners.'}</span>
            </div>
          )}

          {/* TAB 1: ORDERS & STATS */}
          {activeTab === 'orders' && (
            <>
              {/* Stat Metric Cards (2x2 on Mobile, 4x1 on Desktop) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-5">
                
                <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">{isBangla ? 'পেইড সেলস' : 'Paid Sales'}</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5 sm:mt-1">{isBangla ? toBengaliDigits(totalSalesCount) : totalSalesCount}</p>
                  </div>
                  <div className="rounded-xl bg-brand-50 p-2 sm:p-3 text-brand-600">
                    <Package className="h-4 w-4 sm:h-6 sm:w-6" />
                  </div>
                </div>

                <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">{isBangla ? 'মোট আয়' : 'Total Revenue'}</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5 sm:mt-1">৳{isBangla ? toBengaliDigits(totalRevenue.toLocaleString()) : totalRevenue.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2 sm:p-3 text-emerald-600">
                    <DollarSign className="h-4 w-4 sm:h-6 sm:w-6" />
                  </div>
                </div>

                <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">{isBangla ? 'মোট অর্ডার' : 'Total Orders'}</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900 mt-0.5 sm:mt-1">{isBangla ? toBengaliDigits(orders.length) : orders.length}</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-2 sm:p-3 text-blue-600">
                    <TrendingUp className="h-4 w-4 sm:h-6 sm:w-6" />
                  </div>
                </div>

                <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">{isBangla ? 'পেন্ডিং অর্ডার' : 'Pending Review'}</p>
                    <p className="text-lg sm:text-2xl font-black text-amber-600 mt-0.5 sm:mt-1">{isBangla ? toBengaliDigits(pendingOrdersCount) : pendingOrdersCount}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-2 sm:p-3 text-amber-600">
                    <Clock className="h-4 w-4 sm:h-6 sm:w-6" />
                  </div>
                </div>

              </div>

              {/* Orders Table Container */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-2 sm:space-y-4">
                
                {/* Search & Actions Bar */}
                <div className="p-3.5 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-center">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={isBangla ? 'আইডি, নাম, ফোন বা স্ট্যাটাস দিয়ে খুঁজুন...' : 'Search by ID, name, phone, status...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    {(settings.steadfast_enabled || settings.pathao_enabled) && (
                      <button
                        type="button"
                        onClick={() => handleSyncCourierStatus()}
                        disabled={syncingCourier === 'bulk'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition disabled:opacity-50 border border-slate-200/80"
                        title={isBangla ? 'কুরিয়ার এপিআই থেকে ডেলিভারি তথ্য সিঙ্ক করুন' : 'Check live delivery & return statuses from Steadfast & Pathao APIs'}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncingCourier === 'bulk' ? 'animate-spin text-brand-600' : 'text-slate-500'}`} />
                        <span>{syncingCourier === 'bulk' ? (isBangla ? 'সিঙ্ক হচ্ছে...' : 'Syncing...') : (isBangla ? 'কুরিয়ার সিঙ্ক' : 'Sync Couriers')}</span>
                      </button>
                    )}

                    <span className="text-xs font-bold text-slate-500">
                      {isBangla 
                        ? `${toBengaliDigits(orders.length)} টির মধ্যে ${toBengaliDigits(sortedOrders.length)} টি অর্ডার` 
                        : `Showing ${sortedOrders.length} of ${orders.length} orders`}
                    </span>
                  </div>
                </div>

                {/* Live Sync Notification Banner */}
                {syncMessage && (
                  <div className="mx-3.5 sm:mx-4 p-3 bg-brand-50 border border-brand-200 text-brand-900 rounded-xl text-xs font-semibold flex items-center justify-between animate-fadeIn shadow-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand-600 flex-shrink-0" />
                      <span>{syncMessage}</span>
                    </div>
                    <button onClick={() => setSyncMessage(null)} className="text-brand-400 hover:text-brand-700 p-0.5 rounded">
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* 1. MOBILE RESPONSIVE ORDER CARDS (Phone View) */}
                <div className="block md:hidden divide-y divide-slate-200">
                  {paginatedOrders.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      No orders found matching your search.
                    </div>
                  ) : (
                    paginatedOrders.map((order, idx) => {
                      const totalOrderPrice = Number(order.total_price || 0)
                      const provider = order.shipping_provider || 'pathao'
                      const hasConsignment = order.pathao_consignment_id || order.steadfast_consignment_id
                      const currentStatus = order.order_status || 'Pending'
                      const isDispatched = currentStatus === 'Shipped' || currentStatus === 'Delivered' || currentStatus === 'Completed' || order.pathao_status === 'dispatched' || hasConsignment

                      const isFullyPaid = order.payment_status === 'FullyPaid' || (order.payment_details?.advance_paid !== undefined && Number(order.payment_details.advance_paid) >= totalOrderPrice && totalOrderPrice > 0)
                      const advancePaid = order.payment_details?.advance_paid !== undefined
                        ? Number(order.payment_details.advance_paid)
                        : isFullyPaid
                          ? totalOrderPrice
                          : (order.payment_status === 'DeliveryChargePrePaid')
                            ? Number(order.delivery_charge || 0)
                            : 0

                      const dueAmount = isFullyPaid ? 0 : Math.max(0, totalOrderPrice - advancePaid)
                      const isPartiallyPaid = !isFullyPaid && (order.payment_status === 'DeliveryChargePrePaid' || advancePaid > 0)

                      return (
                        <div
                          key={order.id}
                          className={`p-3.5 sm:p-4 space-y-2.5 transition ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-brand-50/40'
                          } hover:bg-brand-50/70`}
                        >
                          {/* Row 1: ID, Date, Order Status Badge */}
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-mono font-black text-slate-900 text-xs">
                                #{order.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                {new Date(order.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                              currentStatus === 'Confirmed'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : currentStatus === 'Shipped'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : currentStatus === 'Delivered' || currentStatus === 'Completed'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : currentStatus === 'Cancelled'
                                      ? 'bg-red-50 text-red-700 border border-red-200'
                                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              {currentStatus}
                            </span>
                          </div>

                          {/* Row 2: Customer Name, 1-Tap Call Phone, Address */}
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="font-bold text-slate-900 text-xs">{order.customer_name}</p>
                              <a
                                href={`tel:${order.customer_phone}`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-200 px-2 py-0.5 rounded-md transition"
                              >
                                <Phone className="h-3 w-3" />
                                <span>{order.customer_phone}</span>
                              </a>
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              {order.shipping_address}
                            </p>
                            {order.payment_details?.shipping_metadata?.city_name && (
                              <p className="text-[10px] text-slate-400 font-semibold">
                                {order.payment_details.shipping_metadata.area_name ? `${order.payment_details.shipping_metadata.area_name}, ` : ''}
                                {order.payment_details.shipping_metadata.city_name}
                              </p>
                            )}
                          </div>

                          {/* Row 3: Items Ordered & Financials */}
                          <div className="flex items-start justify-between gap-3 text-xs">
                            <div className="space-y-0.5 max-w-[55%]">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Items:</span>
                              {(order.order_items || []).map((it, idx) => (
                                <p key={idx} className="text-[11px] text-slate-700 line-clamp-1 font-medium">
                                  {it.quantity}x {it.products?.name || 'Item'}
                                </p>
                              ))}
                            </div>

                            <div className="text-right space-y-0.5">
                              <p className="text-sm font-black text-slate-950">৳{totalOrderPrice.toLocaleString()}</p>
                              <div className="flex items-center justify-end gap-1">
                                <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-bold ${
                                  isFullyPaid
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : isPartiallyPaid
                                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                      : order.payment_status === 'Failed'
                                        ? 'bg-red-50 text-red-700 border border-red-100'
                                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                                }`}>
                                  {isFullyPaid && 'Fully Paid'}
                                  {isPartiallyPaid && 'Partially Paid'}
                                  {!isFullyPaid && !isPartiallyPaid && order.payment_status === 'Failed' && 'Failed'}
                                  {!isFullyPaid && !isPartiallyPaid && order.payment_status !== 'Failed' && 'Pending'}
                                </span>
                                <span className="text-[9px] font-mono text-slate-400 uppercase font-bold">
                                  {order.payment_method === 'BKASH_PERSONAL' ? 'bKash' : order.payment_method}
                                </span>
                              </div>
                              {dueAmount > 0 ? (
                                <p className="text-[10px] text-amber-700 font-bold">
                                  Due on Delivery: ৳{dueAmount.toLocaleString()}
                                </p>
                              ) : isFullyPaid ? (
                                <p className="text-[10px] text-emerald-700 font-bold">
                                  Fully Paid (৳0 Due)
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {/* bKash Personal Verification Card (Mobile) */}
                          {(order.payment_method === 'BKASH_PERSONAL' || order.payment_details?.transaction_id || order.payment_details?.sender_number) && (
                            <div className="p-2.5 rounded-xl bg-pink-50 border border-pink-200 text-xs space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1 font-bold text-pink-700 text-[11px]">
                                  <Smartphone className="h-3.5 w-3.5" />
                                  <span>bKash Personal Payment</span>
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  order.payment_status === 'DeliveryChargePrePaid' || order.payment_status === 'FullyPaid' || order.payment_details?.verified
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : order.payment_status === 'Failed'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-pink-100 text-pink-800'
                                }`}>
                                  {order.payment_status === 'DeliveryChargePrePaid' || (isPartiallyPaid && order.payment_details?.verified)
                                    ? (advancePaid > 0 ? `✓ Advance Verified (৳${advancePaid.toLocaleString()})` : '✓ Advance Verified')
                                    : order.payment_status === 'FullyPaid' || order.payment_details?.verified
                                    ? '✓ Verified (Paid)'
                                    : order.payment_status === 'Failed'
                                    ? 'Failed / Not Received'
                                    : 'Pending Verification'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                {order.payment_details?.sender_number && (
                                  <div className="bg-white p-1.5 rounded-lg border border-pink-100 flex items-center justify-between">
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">Sender:</span>
                                      <span className="font-bold text-slate-900">{order.payment_details.sender_number}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(order.payment_details.sender_number, 'sender')}
                                      className="p-1 text-slate-400 hover:text-pink-600"
                                      title="Copy sender number"
                                    >
                                      {copiedText === `sender-${order.payment_details.sender_number}` ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </div>
                                )}

                                {order.payment_details?.transaction_id && (
                                  <div className="bg-white p-1.5 rounded-lg border border-pink-100 flex items-center justify-between">
                                    <div>
                                      <span className="text-[9px] text-slate-400 font-sans block">TrxID:</span>
                                      <span className="font-bold text-pink-700 uppercase">{order.payment_details.transaction_id}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(order.payment_details.transaction_id, 'trx')}
                                      className="p-1 text-slate-400 hover:text-pink-600"
                                      title="Copy TrxID"
                                    >
                                      {copiedText === `trx-${order.payment_details.transaction_id}` ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="pt-1">
                                {order.payment_status === 'Failed' ? (
                                  <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-red-200">
                                    <span className="text-[10px] text-red-700 font-bold">Payment Rejected</span>
                                    <button
                                      type="button"
                                      onClick={() => handleVerifyBkashPayment(order, true)}
                                      disabled={actionLoading === order.id}
                                      className="text-[10px] text-pink-600 font-bold hover:underline"
                                    >
                                      Re-verify
                                    </button>
                                  </div>
                                ) : (order.payment_status === 'DeliveryChargePrePaid' || order.payment_status === 'FullyPaid' || order.payment_details?.verified) ? (
                                  <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                                    <span className="flex items-center gap-1">
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      <span>{isPartiallyPaid ? (advancePaid > 0 ? `Advance Verified (৳${advancePaid.toLocaleString()})` : 'Advance Verified') : 'Full Payment Verified'}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleVerifyBkashPayment(order, false)}
                                      disabled={actionLoading === order.id}
                                      className="text-slate-400 hover:text-red-600 ml-1 font-normal text-[9px]"
                                      title="Cancel verification"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleVerifyBkashPayment(order, true)}
                                      disabled={actionLoading === order.id}
                                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm flex items-center justify-center gap-1 transition"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      <span>Verify Payment</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleVerifyBkashPayment(order, false)}
                                      disabled={actionLoading === order.id}
                                      className="py-1.5 px-2.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[11px] border border-red-200 flex items-center justify-center gap-1 transition"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                      <span>Invalid</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Row 4: Courier Booking Status */}
                          {hasConsignment ? (
                            <div className="p-2 rounded-lg bg-brand-50 border border-brand-200 text-xs flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-brand-800 font-bold text-[11px]">
                                <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                                <span>{provider === 'steadfast' ? 'Steadfast Booked' : 'Pathao Booked'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-brand-700 font-bold">
                                  #{order.steadfast_consignment_id || order.pathao_consignment_id}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSyncCourierStatus(order.id)}
                                  disabled={syncingCourier === order.id}
                                  className="p-1 rounded hover:bg-brand-200/60 text-brand-700 transition"
                                  title="Refresh Live Courier Status"
                                >
                                  <RefreshCw className={`h-3 w-3 ${syncingCourier === order.id ? 'animate-spin text-brand-700' : ''}`} />
                                </button>
                              </div>
                            </div>
                          ) : isDispatched ? (
                            <div className="p-2 rounded-lg bg-slate-100 text-xs flex items-center gap-1.5 text-slate-700 font-bold text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Marked as Dispatched</span>
                            </div>
                          ) : null}

                          {/* Row 5: Action Buttons (Large Comfort Targets) */}
                          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                            {/* Quick Accept/Decline (for Pending) */}
                            {currentStatus === 'Pending' ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleQuickStatusChange(order.id, 'Confirmed')}
                                  disabled={actionLoading === order.id}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Accept</span>
                                </button>
                                <button
                                  onClick={() => handleQuickStatusChange(order.id, 'Cancelled')}
                                  disabled={actionLoading === order.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span>Decline</span>
                                </button>
                              </div>
                            ) : !hasConsignment && !isDispatched ? (
                              <div className="flex flex-wrap gap-1.5">
                                {settings.pathao_enabled && (
                                  <button
                                    onClick={() => setDispatchConfirm({ order, provider: 'pathao' })}
                                    disabled={actionLoading === order.id}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#CF0012] hover:bg-[#b0000f] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition"
                                  >
                                    <Play className="h-3 w-3" />
                                    <span>Pathao</span>
                                  </button>
                                )}
                                {settings.steadfast_enabled && (
                                  <button
                                    onClick={() => setDispatchConfirm({ order, provider: 'steadfast' })}
                                    disabled={actionLoading === order.id}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#04A285] hover:bg-[#038b72] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition"
                                  >
                                    <Play className="h-3 w-3" />
                                    <span>Steadfast</span>
                                  </button>
                                )}
                                {!settings.pathao_enabled && !settings.steadfast_enabled && (
                                  <button
                                    onClick={() => setDispatchConfirm({ order, provider: 'manual' })}
                                    disabled={actionLoading === order.id}
                                    className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Dispatch</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div />
                            )}

                            {/* Secondary Tools: Edit, Invoice, Delete */}
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                onClick={() => openEditModal(order)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold shadow-sm hover:bg-slate-50"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                <span>Edit</span>
                              </button>
                              <a
                                href={`/invoice/${order.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-xs font-bold shadow-sm"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>Invoice</span>
                              </a>
                              {/* {order.customer_email && (
                                <button
                                  onClick={() => handleSendInvoiceEmail(order)}
                                  disabled={emailingOrderId === order.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold shadow-sm hover:bg-slate-50"
                                  title={`Send Invoice Email to ${order.customer_email}`}
                                >
                                  {emailingOrderId === order.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                                  ) : (
                                    <Mail className="h-3.5 w-3.5 text-slate-500" />
                                  )}
                                </button>
                              )} */}
                              <button
                                onClick={() => setDeleteConfirmOrder(order)}
                                className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 shadow-sm"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* 2. DESKTOP RICH DATA TABLE */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="p-4">
                          <button
                            onClick={() => handleSort('date')}
                            className="inline-flex items-center gap-1.5 hover:text-slate-900 font-bold uppercase transition"
                          >
                            <span>Order ID & Date</span>
                            {sortField === 'date' ? (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60" />
                            )}
                          </button>
                        </th>
                        <th className="p-4">
                          <button
                            onClick={() => handleSort('customer')}
                            className="inline-flex items-center gap-1.5 hover:text-slate-900 font-bold uppercase transition"
                          >
                            <span>Customer</span>
                            {sortField === 'customer' ? (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60" />
                            )}
                          </button>
                        </th>
                        <th className="p-4">Destination</th>
                        <th className="p-4">
                          <button
                            onClick={() => handleSort('status')}
                            className="inline-flex items-center gap-1.5 hover:text-slate-900 font-bold uppercase transition"
                          >
                            <span>Status</span>
                            {sortField === 'status' ? (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60" />
                            )}
                          </button>
                        </th>
                        <th className="p-4">
                          <button
                            onClick={() => handleSort('payment')}
                            className="inline-flex items-center gap-1.5 hover:text-slate-900 font-bold uppercase transition"
                          >
                            <span>Payment</span>
                            {sortField === 'payment' ? (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60" />
                            )}
                          </button>
                        </th>
                        <th className="p-4">
                          <button
                            onClick={() => handleSort('amount')}
                            className="inline-flex items-center gap-1.5 hover:text-slate-900 font-bold uppercase transition"
                          >
                            <span>Total & Dues</span>
                            {sortField === 'amount' ? (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60" />
                            )}
                          </button>
                        </th>
                        <th className="p-4">
                          <button
                            onClick={() => handleSort('courier')}
                            className="inline-flex items-center gap-1.5 hover:text-slate-900 font-bold uppercase transition"
                          >
                            <span>Courier</span>
                            {sortField === 'courier' ? (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-slate-400 opacity-60" />
                            )}
                          </button>
                        </th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedOrders.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            No orders found matching your search.
                          </td>
                        </tr>
                      ) : (
                        paginatedOrders.map((order, idx) => {
                          const totalOrderPrice = Number(order.total_price || 0)
                          const provider = order.shipping_provider || 'pathao'
                          const hasConsignment = order.pathao_consignment_id || order.steadfast_consignment_id
                          const currentStatus = order.order_status || 'Pending'
                          const isDispatched = currentStatus === 'Shipped' || currentStatus === 'Delivered' || currentStatus === 'Completed' || order.pathao_status === 'dispatched' || hasConsignment

                          const isFullyPaid = order.payment_status === 'FullyPaid' || (order.payment_details?.advance_paid !== undefined && Number(order.payment_details.advance_paid) >= totalOrderPrice && totalOrderPrice > 0)
                          const advancePaid = order.payment_details?.advance_paid !== undefined
                            ? Number(order.payment_details.advance_paid)
                            : isFullyPaid
                              ? totalOrderPrice
                              : (order.payment_status === 'DeliveryChargePrePaid')
                                ? Number(order.delivery_charge || 0)
                                : 0

                          const dueAmount = isFullyPaid ? 0 : Math.max(0, totalOrderPrice - advancePaid)
                          const isPartiallyPaid = !isFullyPaid && (order.payment_status === 'DeliveryChargePrePaid' || advancePaid > 0)

                          return (
                            <tr key={order.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-brand-50/40'} hover:bg-brand-50/70 transition`}>
                              
                              {/* ID & Date */}
                              <td className="p-4">
                                <span className="font-mono font-bold text-slate-900">
                                  #{order.id.slice(0, 8).toUpperCase()}
                                </span>
                                <span className="block text-[10px] text-slate-400 mt-0.5">
                                  {new Date(order.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </td>

                              {/* Customer */}
                              <td className="p-4">
                                <p className="font-bold text-slate-900">{order.customer_name}</p>
                                <p className="text-slate-500 font-mono text-[11px] mt-0.5">{order.customer_phone}</p>
                              </td>

                              {/* Destination (Compact with Tooltip) */}
                              <td className="p-4 max-w-[150px] sm:max-w-[180px]" title={order.shipping_address}>
                                <p className="text-slate-700 leading-tight truncate font-medium cursor-help" title={order.shipping_address}>
                                  {order.shipping_address}
                                </p>
                                {order.payment_details?.shipping_metadata?.area_name && (
                                  <span className="text-[10px] font-semibold text-slate-400 block mt-1 truncate" title={`${order.payment_details.shipping_metadata.area_name}, ${order.payment_details.shipping_metadata.city_name}`}>
                                    {order.payment_details.shipping_metadata.area_name}, {order.payment_details.shipping_metadata.city_name}
                                  </span>
                                )}
                              </td>

                              {/* Order Status & Quick Actions */}
                              <td className="p-4 space-y-1.5">
                                <div>
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                                    currentStatus === 'Confirmed'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : currentStatus === 'Shipped'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                        : currentStatus === 'Delivered' || currentStatus === 'Completed'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : currentStatus === 'Cancelled'
                                            ? 'bg-red-50 text-red-700 border border-red-200'
                                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                                  }`}>
                                    {currentStatus}
                                  </span>
                                </div>

                                {currentStatus === 'Pending' && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleQuickStatusChange(order.id, 'Confirmed')}
                                      disabled={actionLoading === order.id}
                                      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold shadow-sm transition"
                                      title="Accept Order"
                                    >
                                      <Check className="h-3 w-3" />
                                      <span>Accept</span>
                                    </button>
                                    <button
                                      onClick={() => handleQuickStatusChange(order.id, 'Cancelled')}
                                      disabled={actionLoading === order.id}
                                      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-bold transition"
                                      title="Decline Order"
                                    >
                                      <XCircle className="h-3 w-3" />
                                      <span>Decline</span>
                                    </button>
                                  </div>
                                )}
                              </td>

                              {/* Payment status */}
                              <td className="p-4">
                                <div className="space-y-1.5">
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                    isFullyPaid
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : isPartiallyPaid
                                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                        : order.payment_status === 'Failed'
                                          ? 'bg-red-50 text-red-700 border border-red-100'
                                          : order.payment_method === 'BKASH_PERSONAL'
                                            ? 'bg-pink-50 text-pink-700 border border-pink-200 font-black'
                                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                                  }`}>
                                    {isFullyPaid && 'Fully Paid'}
                                    {isPartiallyPaid && 'Partially Paid'}
                                    {!isFullyPaid && !isPartiallyPaid && order.payment_status === 'Failed' && 'Failed'}
                                    {!isFullyPaid && !isPartiallyPaid && (order.payment_status === 'Pending Verification' || order.payment_method === 'BKASH_PERSONAL') && 'Verification Needed'}
                                    {!isFullyPaid && !isPartiallyPaid && order.payment_status !== 'Failed' && order.payment_status !== 'Pending Verification' && order.payment_method !== 'BKASH_PERSONAL' && 'Pending'}
                                  </span>

                                  <span className={`block text-[10px] uppercase font-bold ${
                                    order.payment_method === 'BKASH_PERSONAL' ? 'text-pink-600' : 'text-slate-400'
                                  }`}>
                                    {order.payment_method === 'BKASH_PERSONAL' ? 'bKash Personal' : order.payment_method}
                                  </span>

                                  {/* bKash Personal Details Box */}
                                  {(order.payment_method === 'BKASH_PERSONAL' || order.payment_details?.transaction_id || order.payment_details?.sender_number) && (
                                    <div className="p-2 rounded-lg bg-pink-50 border border-pink-200 text-[10px] space-y-1 min-w-[150px]">
                                      {order.payment_details?.sender_number && (
                                        <div className="flex items-center justify-between font-mono">
                                          <span className="text-slate-500 font-sans">Sender:</span>
                                          <div className="flex items-center gap-1 font-bold text-slate-800">
                                            <span>{order.payment_details.sender_number}</span>
                                            <button
                                              type="button"
                                              onClick={() => handleCopyText(order.payment_details.sender_number, 'sender')}
                                              className="text-slate-400 hover:text-pink-600 p-0.5"
                                              title="Copy sender number"
                                            >
                                              {copiedText === `sender-${order.payment_details.sender_number}` ? (
                                                <Check className="h-3 w-3 text-emerald-600" />
                                              ) : (
                                                <Copy className="h-3 w-3" />
                                              )}
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {order.payment_details?.transaction_id && (
                                        <div className="flex items-center justify-between font-mono">
                                          <span className="text-slate-500 font-sans">TrxID:</span>
                                          <div className="flex items-center gap-1 font-bold text-pink-700">
                                            <span className="uppercase">{order.payment_details.transaction_id}</span>
                                            <button
                                              type="button"
                                              onClick={() => handleCopyText(order.payment_details.transaction_id, 'trx')}
                                              className="text-slate-400 hover:text-pink-600 p-0.5"
                                              title="Copy TrxID"
                                            >
                                              {copiedText === `trx-${order.payment_details.transaction_id}` ? (
                                                <Check className="h-3 w-3 text-emerald-600" />
                                              ) : (
                                                <Copy className="h-3 w-3" />
                                              )}
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      <div className="pt-1">
                                        {order.payment_status === 'Failed' ? (
                                          <div className="flex items-center justify-between w-full bg-white px-2 py-1 rounded border border-red-200 text-[10px]">
                                            <span className="font-bold text-red-700 flex items-center gap-0.5">
                                              <XCircle className="h-3 w-3" />
                                              <span>Rejected</span>
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleVerifyBkashPayment(order, true)}
                                              disabled={actionLoading === order.id}
                                              className="text-pink-600 font-bold hover:underline ml-1"
                                              title="Re-verify payment received"
                                            >
                                              Verify
                                            </button>
                                          </div>
                                        ) : (order.payment_status === 'DeliveryChargePrePaid' || order.payment_status === 'FullyPaid' || order.payment_details?.verified) ? (
                                          <div className="flex items-center justify-between w-full bg-white px-2 py-1 rounded border border-emerald-200 text-[10px]">
                                            <span className="font-bold text-emerald-700 flex items-center gap-1">
                                              <Check className="h-3 w-3 text-emerald-600" />
                                              <span>{isPartiallyPaid ? (advancePaid > 0 ? `Advance Verified (৳${advancePaid.toLocaleString()})` : 'Advance Verified') : 'Verified'}</span>
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleVerifyBkashPayment(order, false)}
                                              disabled={actionLoading === order.id}
                                              className="text-slate-400 hover:text-red-600 ml-1 font-normal text-[9px]"
                                              title="Cancel verification"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1 w-full">
                                            <button
                                              type="button"
                                              onClick={() => handleVerifyBkashPayment(order, true)}
                                              disabled={actionLoading === order.id}
                                              className="flex-1 py-1 px-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-sm flex items-center justify-center gap-1 transition"
                                              title="Mark payment as received & verified"
                                            >
                                              <Check className="h-3 w-3" />
                                              <span>Verify</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleVerifyBkashPayment(order, false)}
                                              disabled={actionLoading === order.id}
                                              className="py-1 px-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[10px] border border-red-200 flex items-center justify-center gap-0.5 transition"
                                              title="Mark payment as not received / invalid"
                                            >
                                              <XCircle className="h-3 w-3" />
                                              <span>Invalid</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Pricing */}
                              <td className="p-4 space-y-0.5 font-medium">
                                <p className="text-slate-900 font-bold">৳{totalOrderPrice.toLocaleString()}</p>
                                {dueAmount > 0 ? (
                                  <p className="text-[10px] text-amber-600 font-bold">
                                    COD: ৳{dueAmount.toLocaleString()}
                                  </p>
                                ) : isFullyPaid ? (
                                  <p className="text-[10px] text-emerald-600 font-bold">
                                    Paid (৳0 Due)
                                  </p>
                                ) : null}
                              </td>

                              {/* Courier Consignment & Booking */}
                              <td className="p-4">
                                {hasConsignment ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                                        <CheckCircle2 className="h-3 w-3" />
                                        {provider === 'steadfast' ? 'Steadfast' : 'Pathao'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleSyncCourierStatus(order.id)}
                                        disabled={syncingCourier === order.id}
                                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-brand-600 transition"
                                        title="Refresh live courier status"
                                      >
                                        <RefreshCw className={`h-3 w-3 ${syncingCourier === order.id ? 'animate-spin text-brand-600' : ''}`} />
                                      </button>
                                    </div>
                                    <span className="block font-mono text-[10px] text-slate-500 font-bold">
                                      ID: {order.steadfast_consignment_id || order.pathao_consignment_id}
                                    </span>
                                    {order.steadfast_tracking_code && (
                                      <span className="block font-mono text-[10px] text-blue-600">
                                        Track: {order.steadfast_tracking_code}
                                      </span>
                                    )}
                                  </div>
                                ) : isDispatched ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    Dispatched
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5 items-center">
                                    {settings.pathao_enabled && (
                                      <button
                                        onClick={() => setDispatchConfirm({ order, provider: 'pathao' })}
                                        disabled={actionLoading === order.id}
                                        className="inline-flex items-center gap-1 rounded bg-[#CF0012] hover:bg-[#b0000f] px-2.5 py-1 text-[10px] font-bold text-white disabled:bg-slate-300 shadow-sm transition"
                                        title="Book Pathao Aladdin Parcel"
                                      >
                                        <Play className="h-3 w-3" />
                                        <span>{actionLoading === order.id ? 'Booking...' : 'Pathao'}</span>
                                      </button>
                                    )}
                                    {settings.steadfast_enabled && (
                                      <button
                                        onClick={() => setDispatchConfirm({ order, provider: 'steadfast' })}
                                        disabled={actionLoading === order.id}
                                        className="inline-flex items-center gap-1 rounded bg-[#04A285] hover:bg-[#038b72] px-2.5 py-1 text-[10px] font-bold text-white disabled:bg-slate-300 shadow-sm transition"
                                        title="Book Steadfast Courier Parcel"
                                      >
                                        <Play className="h-3 w-3" />
                                        <span>{actionLoading === order.id ? 'Booking...' : 'Steadfast'}</span>
                                      </button>
                                    )}
                                    {!settings.pathao_enabled && !settings.steadfast_enabled && (
                                      <button
                                        onClick={() => setDispatchConfirm({ order, provider: 'manual' })}
                                        disabled={actionLoading === order.id}
                                        className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[10px] font-bold text-white disabled:bg-slate-300 shadow-sm transition"
                                        title="Mark order as dispatched manually"
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                        <span>Mark Dispatched</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Action Buttons */}
                              <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => openEditModal(order)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm text-xs font-semibold transition"
                                  title="Edit Full Order Details"
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                  <span>Edit</span>
                                </button>
                                <a
                                  href={`/invoice/${order.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:border-brand-300 shadow-sm text-xs font-bold transition"
                                  title="Open Printable Customer Invoice"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  <span>Invoice</span>
                                </a>
                                {/* {order.customer_email && (
                                  <button
                                    onClick={() => handleSendInvoiceEmail(order)}
                                    disabled={emailingOrderId === order.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm text-xs font-semibold transition"
                                    title={`Send Invoice Email to ${order.customer_email}`}
                                  >
                                    {emailingOrderId === order.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                                    ) : (
                                      <Mail className="h-3.5 w-3.5 text-slate-500" />
                                    )}
                                    <span className="hidden xl:inline">Email</span>
                                  </button>
                                )} */}
                                <button
                                  onClick={() => setDeleteConfirmOrder(order)}
                                  className="inline-flex items-center gap-1 p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 shadow-sm text-xs font-semibold transition"
                                  title="Delete Order"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>

                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                {sortedOrders.length > 0 && (
                  <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span>Show:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value))
                          setCurrentPage(1)
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-800 outline-none focus:border-brand-500"
                      >
                        <option value={10}>10 per page</option>
                        <option value={20}>20 per page (default)</option>
                        <option value={50}>50 per page</option>
                      </select>
                      <span className="text-slate-400">
                        | Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedOrders.length)} of {sortedOrders.length} orders
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        Previous
                      </button>
                      
                      <div className="flex items-center gap-1 px-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                          .map((p, idx, arr) => (
                            <React.Fragment key={p}>
                              {idx > 0 && arr[idx - 1] !== p - 1 && (
                                <span className="px-1 text-slate-400">...</span>
                              )}
                              <button
                                type="button"
                                onClick={() => setCurrentPage(p)}
                                className={`h-7 w-7 rounded-lg text-xs font-bold transition ${
                                  currentPage === p
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                {p}
                              </button>
                            </React.Fragment>
                          ))}
                      </div>

                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: CONTACT MESSAGES */}
          {activeTab === 'messages' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Customer Contact Inquiries</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Messages submitted by customers from the storefront Contact Us page.
                  </p>
                </div>
                <button
                  onClick={loadMessages}
                  className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {loadingMessages ? (
                <div className="p-12 text-center text-xs text-slate-400">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <MessageSquare className="h-10 w-10 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700 text-sm">No Contact Messages</p>
                  <p className="text-xs">When customers submit inquiries via `/contact`, they will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`p-6 transition ${
                        !msg.is_read ? 'bg-amber-50/40 border-l-4 border-amber-500' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-950 text-sm">{msg.name}</span>
                          {!msg.is_read && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse">
                              UNREAD
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3" />
                            {new Date(msg.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleMessageRead(msg)}
                            className="text-xs font-bold text-slate-600 hover:text-brand-600 border border-slate-200 px-2.5 py-1 rounded-lg bg-white shadow-sm transition"
                          >
                            {msg.is_read ? 'Mark as Unread' : 'Mark as Read'}
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded transition"
                            title="Delete Message"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Contact Info Pills */}
                      <div className="flex flex-wrap gap-4 py-2 text-xs">
                        <a 
                          href={`tel:${msg.phone}`}
                          className="flex items-center gap-1 text-brand-600 font-bold hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>{msg.phone}</span>
                        </a>
                        {msg.email && (
                          <a 
                            href={`mailto:${msg.email}`}
                            className="flex items-center gap-1 text-slate-600 hover:underline"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span>{msg.email}</span>
                          </a>
                        )}
                        {msg.subject && (
                          <span className="text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            Subject: {msg.subject}
                          </span>
                        )}
                      </div>

                      {/* Message Content */}
                      <p className="mt-2 text-xs leading-relaxed text-slate-800 bg-white p-3.5 rounded-xl border border-slate-200/80 whitespace-pre-line shadow-inner">
                        {msg.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* FULL ORDER DETAILS EDIT MODAL */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-950">
                  Edit Order Details (#{editingOrder.id.slice(0, 8).toUpperCase()})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">
                  Placed on {new Date(editingOrder.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="space-y-6 text-xs">
              
              {/* SECTION 1: STATUS CONTROLS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Order Fulfillment Status</label>
                  <select
                    value={editOrderStatus}
                    onChange={(e) => setEditOrderStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-brand-500"
                  >
                    <option value="Pending">Pending (Awaiting Review)</option>
                    <option value="Confirmed">Confirmed (Accepted)</option>
                    <option value="Shipped">Shipped (Dispatched)</option>
                    <option value="Delivered">Delivered (Handed to Customer)</option>
                    <option value="Completed">Completed (Delivered & Paid)</option>
                    <option value="Cancelled">Cancelled (Declined)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Payment Status</label>
                  <select
                    value={editPaymentStatus}
                    onChange={(e) => setEditPaymentStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-brand-500"
                  >
                    <option value="Pending">Pending (Unpaid)</option>
                    <option value="Pending Verification">Pending Verification (bKash Personal)</option>
                    <option value="DeliveryChargePrePaid">Partially Paid (Advance Received)</option>
                    <option value="FullyPaid">Fully Paid (Verified / Online)</option>
                    <option value="Failed">Failed / Unsuccessful</option>
                  </select>
                </div>
              </div>

              {/* BKASH PERSONAL SENDER INFO CALLOUT (IF APPLICABLE) */}
              {(editingOrder.payment_method === 'BKASH_PERSONAL' || editingOrder.payment_details?.transaction_id || editingOrder.payment_details?.sender_number) && (
                <div className="p-3 rounded-2xl bg-pink-50 border border-pink-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-pink-800 flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4" />
                      <span>bKash Personal Payment Details</span>
                    </span>
                    <span className="text-[10px] uppercase font-bold text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">
                      {editingOrder.payment_status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1 font-mono text-[11px]">
                    <div className="bg-white p-2 rounded-xl border border-pink-100">
                      <span className="text-[10px] text-slate-400 font-sans block">Sender Phone:</span>
                      <span className="font-bold text-slate-900">{editingOrder.payment_details?.sender_number || 'Not provided'}</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-pink-100">
                      <span className="text-[10px] text-slate-400 font-sans block">TrxID:</span>
                      <span className="font-bold text-pink-700 uppercase">{editingOrder.payment_details?.transaction_id || 'Not provided'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: CUSTOMER DETAILS */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Customer & Shipping Information</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Phone Number *</label>
                    <input
                      type="text"
                      required
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500 font-mono font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Detailed Delivery Address *</label>
                  <textarea
                    rows={2}
                    required
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500 leading-relaxed font-medium"
                  />
                </div>

                {/* Pathao Region Dropdowns */}
                {settings.pathao_enabled && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">City</label>
                      <select
                        value={editCity}
                        onChange={(e) => {
                          setEditCity(e.target.value)
                          setEditZone('')
                          setEditArea('')
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand-500"
                      >
                        <option value="">Select City</option>
                        {locationCities.map((city) => (
                          <option key={city.city_id} value={city.city_id}>{city.city_name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Zone</label>
                      <select
                        disabled={!editCity || locationZones.length === 0}
                        value={editZone}
                        onChange={(e) => {
                          setEditZone(e.target.value)
                          setEditArea('')
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none disabled:bg-slate-100 focus:border-brand-500"
                      >
                        <option value="">Select Zone</option>
                        {locationZones.map((zone) => (
                          <option key={zone.zone_id} value={zone.zone_id}>{zone.zone_name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Area</label>
                      <select
                        disabled={!editZone || locationAreas.length === 0}
                        value={editArea}
                        onChange={(e) => setEditArea(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none disabled:bg-slate-100 focus:border-brand-500"
                      >
                        <option value="">Select Area</option>
                        {locationAreas.map((area) => (
                          <option key={area.area_id} value={area.area_id}>{area.area_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: ORDERED ITEMS & QUANTITIES */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Ordered Items & Quantities</h4>
                  <span className="text-[11px] font-semibold text-slate-400">{editItems.length} items</span>
                </div>

                {!canEditItems && (
                  <div className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 text-[11px] font-medium">
                    Items can't be changed after the order has shipped or been cancelled.
                  </div>
                )}

                {editItems.length === 0 ? (
                  <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-center font-medium">
                    All items removed. You can cancel or decline this order.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {editItems.map((item, idx) => (
                      <div key={item.id || idx} className="p-3 bg-white flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 truncate">{item.name}</p>
                          {item.selected_variations && typeof item.selected_variations === 'object' && (
                            <p className="text-[10px] text-slate-400 truncate">
                              {Object.entries(item.selected_variations).map(([k, v]) => `${k}: ${v}`).join(', ')}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            ৳{Number(item.price).toLocaleString()} / unit
                            {item.isNew ? (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                Added
                              </span>
                            ) : item.quantity !== item.originalQuantity && (
                              <span className="ml-1.5 font-bold text-amber-700">
                                (customer ordered {item.originalQuantity})
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-2">
                          {!canEditItems ? (
                            <span className="px-2.5 py-1 text-xs font-bold text-slate-900">× {item.quantity}</span>
                          ) : (
                          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleItemQtyChange(idx, -1)}
                              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2.5 py-1 text-xs font-bold text-slate-900 min-w-[28px] text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleItemQtyChange(idx, 1)}
                              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          )}

                          <div className="text-right min-w-[65px]">
                            <span className="font-black text-slate-900 text-xs">
                              ৳{(item.price * item.quantity).toLocaleString()}
                            </span>
                          </div>

                          {/* Remove Item Button */}
                          {canEditItems && <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            disabled={editItems.length <= 1}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:cursor-not-allowed"
                            title={editItems.length <= 1 ? 'An order needs at least one item. Cancel the order instead.' : 'Remove item from order'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add a product the customer asked for after ordering */}
                {canEditItems && !pickerOpen && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-brand-500 hover:text-brand-700 hover:bg-brand-50/40 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add product
                  </button>
                )}

                {canEditItems && pickerOpen && (
                  <div className="p-3 rounded-2xl border border-brand-200 bg-brand-50/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700">Add a product to this order</span>
                      <button
                        type="button"
                        onClick={closeProductPicker}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                      >
                        Close
                      </button>
                    </div>

                    {!pickerProduct ? (
                      <>
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            autoFocus
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                            placeholder="Search products by name..."
                            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs outline-none focus:border-brand-500"
                          />
                        </div>

                        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                          {pickerLoading ? (
                            <div className="p-4 flex justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                            </div>
                          ) : pickerResults.length === 0 ? (
                            <p className="p-4 text-center text-[11px] text-slate-400">No products found.</p>
                          ) : (
                            pickerResults.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => choosePickerProduct(p)}
                                className="w-full flex items-center gap-2.5 p-2 text-left hover:bg-slate-50 transition"
                              >
                                {p.images?.[0] ? (
                                  <img src={p.images[0]} alt="" className="h-9 w-9 rounded-lg object-cover bg-slate-100 shrink-0" />
                                ) : (
                                  <div className="h-9 w-9 rounded-lg bg-slate-100 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                                  <p className="text-[10px] text-slate-500">
                                    ৳{Number(p.price).toLocaleString()} · {Number(p.stock) > 0 ? `${p.stock} in stock` : <span className="text-red-600 font-bold">out of stock</span>}
                                    {p.is_hidden && <span className="ml-1 text-amber-700 font-bold">· hidden</span>}
                                  </p>
                                </div>
                                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    ) : (() => {
                      const options = pickerOptions(pickerProduct.variations)
                      const variant = pickerVariant(pickerProduct, pickerChoice)
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-900 truncate">{pickerProduct.name}</p>
                            <button
                              type="button"
                              onClick={() => { setPickerProduct(null); setPickerChoice({}) }}
                              className="text-[11px] font-bold text-brand-700 hover:underline shrink-0"
                            >
                              Change product
                            </button>
                          </div>

                          {options.map((opt) => (
                            <div key={opt.name} className="space-y-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{opt.name}</label>
                              <select
                                value={pickerChoice[opt.name] || ''}
                                onChange={(e) => setPickerChoice((prev) => ({ ...prev, [opt.name]: e.target.value }))}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand-500"
                              >
                                <option value="" disabled>Choose {opt.name}</option>
                                {opt.values.map((v) => (
                                  <option key={v.label} value={v.label}>
                                    {v.label}
                                    {v.price !== undefined && v.price > 0 ? ` · ৳${v.price.toLocaleString()}` : ''}
                                    {typeof v.stock === 'number' ? ` · ${v.stock > 0 ? `${v.stock} in stock` : 'out of stock'}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}

                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                              <button
                                type="button"
                                onClick={() => setPickerQty((q) => Math.max(1, q - 1))}
                                className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="px-2.5 py-1 text-xs font-bold text-slate-900 min-w-[28px] text-center">{pickerQty}</span>
                              <button
                                type="button"
                                onClick={() => setPickerQty((q) => q + 1)}
                                className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-slate-900">৳{(variant.price * pickerQty).toLocaleString()}</p>
                              <p className="text-[10px] text-slate-500">৳{variant.price.toLocaleString()} / unit</p>
                            </div>
                          </div>

                          {variant.complete && pickerQty > variant.stock && (
                            <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                              Only {variant.stock} in stock right now. You can still add it if you have the units on hand.
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={handleAddPickedProduct}
                            disabled={!variant.complete}
                            className="w-full px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-sm disabled:bg-slate-300 transition"
                          >
                            Add to order
                          </button>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

              {/* SECTION 4: FINANCIAL SUMMARY & DUE CALCULATION */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Financials & Doorstep Due</h4>
                
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>Products Subtotal:</span>
                    <span className="font-bold text-slate-900">৳{modalSubtotal.toLocaleString()}</span>
                  </div>

                  {(modalDiscount > 0 || Number(editingOrder.discount_amount || 0) > 0) && (
                    <div className="flex items-center justify-between text-emerald-600 font-bold">
                      <div>
                        <span>Discount {editingOrder.promo_code ? `(${editingOrder.promo_code})` : ''}:</span>
                        {modalItemsChanged && (
                          <span className="text-[10px] text-slate-400 font-medium block">Set for the original order. Adjust if items changed.</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span>-৳</span>
                        <input
                          type="number"
                          min={0}
                          value={editDiscountAmount}
                          onChange={(e) => setEditDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-right text-emerald-700 outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-slate-600 font-medium">
                    <span>Delivery Charge:</span>
                    <div className="flex items-center gap-1">
                      <span>৳</span>
                      <input
                        type="number"
                        value={editDeliveryCharge}
                        onChange={(e) => setEditDeliveryCharge(Number(e.target.value))}
                        className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-right outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-sm font-black text-slate-950 pt-2 border-t border-slate-200">
                    <span>Total Order Amount:</span>
                    <span className="text-brand-700 font-black">৳{modalTotalPrice.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600 font-medium">
                    <div>
                      <span className="font-bold text-slate-700">Paid Advance:</span>
                      <span className="text-[10px] text-slate-400 block">Edit if collected via bKash, bank, or cash</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>৳</span>
                      <input
                        type="number"
                        value={editAdvancePaid}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          setEditAdvancePaid(val)
                          if (val >= modalTotalPrice && modalTotalPrice > 0) {
                            setEditPaymentStatus('FullyPaid')
                          } else if (val > 0) {
                            setEditPaymentStatus('DeliveryChargePrePaid')
                          } else {
                            setEditPaymentStatus('Pending')
                          }
                        }}
                        className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-right outline-none focus:border-brand-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-xs font-black text-amber-900 bg-amber-100/70 p-2.5 rounded-xl border border-amber-200 mt-2">
                    <span>Balance Due on Delivery:</span>
                    <span>৳{modalDueOnDelivery.toLocaleString()}</span>
                  </div>

                  {editAdvancePaid > modalTotalPrice && (
                    <div className="flex justify-between text-xs font-black text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">
                      <span>Refund owed to customer:</span>
                      <span>৳{(editAdvancePaid - modalTotalPrice).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {orderItemsOrTotalChanged && editOrderStatus !== 'Cancelled' && (
                  <div className="space-y-2">
                    {modalItemsReduced && editingOrderHoldsStock && (
                      <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-slate-50 border-slate-200 text-slate-700 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restockRemoved}
                          onChange={(e) => setRestockRemoved(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                        />
                        <span>
                          <span className="font-bold block">Put removed units back in stock</span>
                          Tick this if the units are actually on the shelf (e.g. the customer changed their mind). Leave it off if they were never really in stock.
                        </span>
                      </label>
                    )}
                    {editingOrderHasConsignment && (
                      <div className="p-3 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-[11px] font-medium">
                        This order is already booked with the courier. After saving, update the COD (cash to collect) amount in the courier panel to ৳{modalDueOnDelivery.toLocaleString()}.
                      </div>
                    )}
                    <label className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${editEmail ? 'bg-blue-50 border-blue-200 text-blue-900 cursor-pointer' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                      <input
                        type="checkbox"
                        checked={!!editEmail && notifyCustomer}
                        disabled={!editEmail}
                        onChange={(e) => setNotifyCustomer(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded accent-brand-600"
                      />
                      <span>
                        <span className="font-bold block">Email the customer the updated order</span>
                        {editEmail
                          ? <>Sends what changed, the new total and a link to the updated invoice to {editEmail}.</>
                          : <>No email address on this order. Add one above to notify the customer.</>}
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-md disabled:bg-slate-400 transition"
                >
                  {saveLoading ? 'Saving Changes...' : 'Save All Changes'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* COURIER DISPATCH CONFIRMATION MODAL */}
      {dispatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 max-w-lg w-full space-y-5 animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl text-white shadow-sm ${
                  dispatchConfirm.provider === 'pathao'
                    ? 'bg-[#CF0012]'
                    : dispatchConfirm.provider === 'steadfast'
                      ? 'bg-[#04A285]'
                      : 'bg-slate-800'
                }`}>
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-950">
                    Confirm Courier Dispatch
                  </h3>
                  <p className="text-xs font-bold text-slate-500">
                    {dispatchConfirm.provider === 'pathao'
                      ? 'Pathao Express Parcel'
                      : dispatchConfirm.provider === 'steadfast'
                        ? 'Steadfast Courier Parcel'
                        : 'Manual / Direct Delivery'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setDispatchConfirm(null)}
                className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Warning if order is not confirmed yet */}
            {(dispatchConfirm.order.order_status || 'Pending') !== 'Confirmed' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Order Status Warning</p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    This order is currently <strong>{dispatchConfirm.order.order_status || 'Pending'}</strong> (not confirmed yet). Confirming dispatch will automatically accept and update its fulfillment status to <strong>Shipped</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Order Details Breakdown Box */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between font-medium text-slate-600">
                <span>Order Invoice ID:</span>
                <span className="font-bold font-mono text-slate-900">#{dispatchConfirm.order.id.slice(0, 8).toUpperCase()}</span>
              </div>

              <div className="flex justify-between font-medium text-slate-600">
                <span>Recipient Name:</span>
                <span className="font-bold text-slate-900">{dispatchConfirm.order.customer_name}</span>
              </div>

              <div className="flex justify-between font-medium text-slate-600">
                <span>Phone Number:</span>
                <span className="font-mono font-bold text-slate-900">{dispatchConfirm.order.customer_phone}</span>
              </div>

              <div className="flex justify-between font-medium text-slate-600 items-start gap-4">
                <span className="flex-shrink-0">Destination:</span>
                <span className="text-right font-medium text-slate-800 line-clamp-2">{dispatchConfirm.order.shipping_address}</span>
              </div>

              {dispatchConfirm.order.payment_details?.shipping_metadata?.area_name && (
                <div className="flex justify-between font-medium text-slate-500 text-[11px]">
                  <span>Area / City:</span>
                  <span>{dispatchConfirm.order.payment_details.shipping_metadata.area_name}, {dispatchConfirm.order.payment_details.shipping_metadata.city_name}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex justify-between font-medium text-slate-600">
                <span>Total Order Amount:</span>
                <span className="font-bold text-slate-900">৳{Number(dispatchConfirm.order.total_price).toLocaleString()}</span>
              </div>

              {(() => {
                const advance = dispatchConfirm.order.payment_details?.advance_paid !== undefined
                  ? Number(dispatchConfirm.order.payment_details.advance_paid)
                  : dispatchConfirm.order.payment_status === 'FullyPaid'
                    ? Number(dispatchConfirm.order.total_price)
                    : dispatchConfirm.order.payment_status === 'DeliveryChargePrePaid'
                      ? Number(dispatchConfirm.order.delivery_charge)
                      : 0
                const codToCollect = Math.max(0, Number(dispatchConfirm.order.total_price) - advance)

                return (
                  <>
                    {advance > 0 && (
                      <div className="flex justify-between text-brand-700 font-semibold">
                        <span>Advance Paid:</span>
                        <span>-৳{advance.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black text-amber-900 bg-amber-100/80 p-2.5 rounded-xl border border-amber-200 mt-1.5">
                      <span>Courier COD Amount to Collect:</span>
                      <span>৳{codToCollect.toLocaleString()}</span>
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Prompt */}
            <p className="text-xs text-slate-600 text-center font-medium">
              Are you sure you want to book this dispatch with <strong>{
                dispatchConfirm.provider === 'pathao'
                  ? 'Pathao Express'
                  : dispatchConfirm.provider === 'steadfast'
                    ? 'Steadfast Courier'
                    : 'Manual Delivery'
              }</strong>?
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDispatchConfirm(null)}
                disabled={actionLoading === dispatchConfirm.order.id}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteDispatch(dispatchConfirm.order.id, dispatchConfirm.provider)}
                disabled={actionLoading === dispatchConfirm.order.id}
                className={`px-6 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition disabled:bg-slate-400 ${
                  dispatchConfirm.provider === 'pathao'
                    ? 'bg-[#CF0012] hover:bg-[#b0000f]'
                    : dispatchConfirm.provider === 'steadfast'
                      ? 'bg-[#04A285] hover:bg-[#038b72]'
                      : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {actionLoading === dispatchConfirm.order.id ? 'Booking Consignment...' : 'Yes, Confirm & Dispatch'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DELETE ORDER CONFIRMATION MODAL */}
      {deleteConfirmOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 max-w-md w-full space-y-5 animate-scale-up">
            
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-red-100 text-red-600 shadow-sm">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-950">
                  Delete Order Permanently?
                </h3>
                <p className="text-xs font-mono font-bold text-slate-500">
                  #{deleteConfirmOrder.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-200 rounded-2xl p-3.5 space-y-1.5 text-xs text-red-900">
              <p className="font-bold">⚠️ Warning: This action cannot be undone.</p>
              <p className="text-[11px] text-red-800 leading-relaxed">
                This will completely remove Order <strong>#{deleteConfirmOrder.id.slice(0, 8).toUpperCase()}</strong> for <strong>{deleteConfirmOrder.customer_name}</strong> (৳{Number(deleteConfirmOrder.total_price).toLocaleString()}) and all its associated line items from the database.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOrder(null)}
                disabled={deleteLoading}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteOrder(deleteConfirmOrder.id)}
                disabled={deleteLoading}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md transition disabled:bg-slate-400"
              >
                {deleteLoading ? 'Deleting...' : 'Yes, Delete Order'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
