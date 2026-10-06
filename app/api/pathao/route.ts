import { NextRequest, NextResponse } from 'next/server'
import { getStoreSettings, SECRET_SETTING_KEYS, isMaskedSecret } from '@/utils/settings'
import { getPathaoToken, fetchPathaoStores } from '@/utils/courier'
import axios from 'axios'
import { verifyStaffAuth } from '@/utils/auth'

// Credentials are only ever sent to Pathao's own API hosts
const PATHAO_HOSTS = ['courier-api.pathao.com', 'courier-api-sandbox.pathao.com', 'api-hermes.pathao.com']

function isAllowedPathaoUrl(url?: string) {
  if (!url) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && PATHAO_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const cityId = searchParams.get('city_id')
  const zoneId = searchParams.get('zone_id')

  const settings = await getStoreSettings()
  const pathao_api_url = (settings.pathao_api_url || process.env.PATHAO_API_URL || 'https://courier-api-sandbox.pathao.com').replace(/\/$/, '')

  try {
    if (action === 'stores') {
      const auth = await verifyStaffAuth(['shop_owner', 'admin'])
      if (!auth.authorized) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
      }
      const stores = await fetchPathaoStores()
      return NextResponse.json({ success: true, data: stores })
    }

    const token = await getPathaoToken()
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }

    if (action === 'cities') {
      const response = await axios.get(`${pathao_api_url}/aladdin/api/v1/city-list`, { headers })
      return NextResponse.json(response.data?.data?.data || [])
    }

    if ((cityId && !/^\d+$/.test(cityId)) || (zoneId && !/^\d+$/.test(zoneId))) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    if (cityId) {
      const response = await axios.get(`${pathao_api_url}/aladdin/api/v1/cities/${cityId}/zone-list`, { headers })
      return NextResponse.json(response.data?.data?.data || [])
    }

    if (zoneId) {
      const response = await axios.get(`${pathao_api_url}/aladdin/api/v1/zones/${zoneId}/area-list`, { headers })
      return NextResponse.json(response.data?.data?.data || [])
    }

    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  } catch (error: any) {
    console.error('Pathao Fetch Error:', error.response?.data || error.message)
    return NextResponse.json({ error: 'Failed to fetch Pathao data' }, { status: 500 })
  }
}

// POST: Test credentials & fetch stores with uncommitted settings
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyStaffAuth(['shop_owner', 'admin'])
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const body = await request.json()

    if (!isAllowedPathaoUrl(body.pathao_api_url)) {
      return NextResponse.json({ success: false, error: 'Pathao API URL must be an official Pathao host.' }, { status: 400 })
    }

    // Masked (unchanged) secrets fall back to the stored values
    for (const key of SECRET_SETTING_KEYS) {
      if (isMaskedSecret(body[key])) delete body[key]
    }

    const stores = await fetchPathaoStores(body)
    return NextResponse.json({ success: true, data: stores })
  } catch (error: any) {
    console.error('Pathao Verify Error:', error.response?.data || error.message)
    return NextResponse.json({ success: false, error: error.message || 'Pathao verification failed' }, { status: 400 })
  }
}
