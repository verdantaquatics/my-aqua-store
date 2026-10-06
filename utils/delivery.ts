// Delivery charge rules shared by checkout, product pages, the dashboard and the
// server-side order pricing, so every place shows and charges the same amount.

export interface DeliverySettingsLike {
  delivery_mode?: 'zone' | 'flat' | string
  delivery_charge_flat?: number | string
  delivery_charge_inside_dhaka?: number | string
  delivery_charge_outside_dhaka?: number | string
  shipping_zone_1_label?: string
  shipping_zone_2_label?: string
  store_city_name?: string
}

export function isFlatDelivery(settings: DeliverySettingsLike): boolean {
  return settings.delivery_mode === 'flat'
}

export function getFlatDeliveryCharge(settings: DeliverySettingsLike): number {
  return Number(settings.delivery_charge_flat ?? 0) || 0
}

export function getZoneLabels(settings: DeliverySettingsLike) {
  const city = settings.store_city_name || 'the city'
  return {
    zone1: settings.shipping_zone_1_label || `Inside ${city}`,
    zone2: settings.shipping_zone_2_label || `Outside ${city}`
  }
}

/** Charge for an address inside (zone 1) or outside (zone 2) the store's city */
export function getDeliveryCharge(settings: DeliverySettingsLike, insideCity: boolean): number {
  if (isFlatDelivery(settings)) return getFlatDeliveryCharge(settings)
  return Number(insideCity ? settings.delivery_charge_inside_dhaka : settings.delivery_charge_outside_dhaka) || 0
}

/** Short customer-facing summary, e.g. "৳100 anywhere in Bangladesh" or "৳80 inside Khulna / ৳130 outside Khulna" */
export function describeDeliveryCharges(settings: DeliverySettingsLike, bangla = false, toDigits: (n: number | string) => string = String): string {
  if (isFlatDelivery(settings)) {
    const flat = toDigits(getFlatDeliveryCharge(settings))
    return bangla ? `সারা বাংলাদেশে ৳${flat}` : `৳${flat} anywhere in Bangladesh`
  }
  const { zone1, zone2 } = getZoneLabels(settings)
  const inside = toDigits(Number(settings.delivery_charge_inside_dhaka ?? 0))
  const outside = toDigits(Number(settings.delivery_charge_outside_dhaka ?? 0))
  return bangla
    ? `${zone1} ৳${inside} এবং ${zone2} ৳${outside}`
    : `৳${inside} ${zone1.toLowerCase()}, ৳${outside} ${zone2.toLowerCase()}`
}
