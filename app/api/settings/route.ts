import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import {
  getStoreSettings,
  invalidateSettingsCache,
  StoreSettings,
  SECRET_SETTING_KEYS,
  isMaskedSecret,
  maskSecretSettings
} from '@/utils/settings'
import { formatExternalUrl } from '@/utils/url'
import { verifyStaffAuth } from '@/utils/auth'

export const dynamic = 'force-dynamic'

// Tracking IDs are interpolated into inline <script> tags, so only allow their real formats
const TRACKING_ID_FORMATS: Record<string, RegExp> = {
  google_tag_manager_id: /^GTM-[A-Z0-9]+$/i,
  google_analytics_id: /^(G|UA|AW)-[A-Z0-9-]+$/i,
  tiktok_pixel_id: /^[A-Z0-9]+$/i
}

// PUT: Update settings (Shop Owner & Admin only)
export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyStaffAuth(['shop_owner', 'admin'])
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createAdminClient()
    const body: Partial<StoreSettings> = await request.json()

    // Secrets are shown masked in the dashboard; an unchanged mask means "keep the current value"
    for (const key of SECRET_SETTING_KEYS) {
      if (isMaskedSecret((body as any)[key])) delete (body as any)[key]
    }

    for (const [key, format] of Object.entries(TRACKING_ID_FORMATS)) {
      const value = (body as any)[key]
      if (typeof value === 'string' && value.trim() && !format.test(value.trim())) {
        return NextResponse.json({ error: `Invalid format for ${key.replace(/_/g, ' ')}.` }, { status: 400 })
      }
    }

    // Custom <head> scripts run on every page: restricted to the shop owner
    if (body.custom_head_scripts !== undefined && auth.role !== 'shop_owner') {
      delete body.custom_head_scripts
    }

    // Fetch existing settings
    const current = await getStoreSettings(true)

    // Build updated payload preserving untouched fields
    const updatedPayload = {
      store_name: body.store_name?.trim() || current.store_name,
      store_tagline: body.store_tagline !== undefined ? body.store_tagline : current.store_tagline,
      logo_url: body.logo_url !== undefined ? body.logo_url : current.logo_url,
      favicon_url: body.favicon_url !== undefined ? body.favicon_url : current.favicon_url,
      watermark_enabled: body.watermark_enabled !== undefined ? Boolean(body.watermark_enabled) : current.watermark_enabled,
      hero_image_url: body.hero_image_url !== undefined ? body.hero_image_url : current.hero_image_url,
      hero_badge_text: body.hero_badge_text !== undefined ? body.hero_badge_text : current.hero_badge_text,
      hero_title: body.hero_title !== undefined ? body.hero_title : current.hero_title,
      hero_subtitle: body.hero_subtitle !== undefined ? body.hero_subtitle : current.hero_subtitle,
      hero_description: body.hero_description !== undefined ? body.hero_description : current.hero_description,
      theme_color: body.theme_color || current.theme_color || 'emerald',
      cod_enabled: body.cod_enabled !== undefined ? Boolean(body.cod_enabled) : current.cod_enabled,
      cod_prepay_delivery: body.cod_prepay_delivery !== undefined ? Boolean(body.cod_prepay_delivery) : current.cod_prepay_delivery,
      bkash_enabled: body.bkash_enabled !== undefined ? Boolean(body.bkash_enabled) : current.bkash_enabled,
      bkash_personal_enabled: body.bkash_personal_enabled !== undefined ? Boolean(body.bkash_personal_enabled) : current.bkash_personal_enabled,
      bkash_personal_number: body.bkash_personal_number !== undefined ? body.bkash_personal_number : current.bkash_personal_number,
      bkash_personal_name: body.bkash_personal_name !== undefined ? body.bkash_personal_name : current.bkash_personal_name,
      bkash_personal_qr_url: body.bkash_personal_qr_url !== undefined ? body.bkash_personal_qr_url : current.bkash_personal_qr_url,
      resend_api_key: body.resend_api_key !== undefined ? body.resend_api_key : current.resend_api_key,
      resend_from_email: body.resend_from_email !== undefined ? body.resend_from_email : current.resend_from_email,
      email_invoice_enabled: body.email_invoice_enabled !== undefined ? Boolean(body.email_invoice_enabled) : current.email_invoice_enabled,
      email_dispatched_enabled: body.email_dispatched_enabled !== undefined ? Boolean(body.email_dispatched_enabled) : current.email_dispatched_enabled,
      email_cancelled_enabled: body.email_cancelled_enabled !== undefined ? Boolean(body.email_cancelled_enabled) : current.email_cancelled_enabled,
      daily_digest_enabled: body.daily_digest_enabled !== undefined ? Boolean(body.daily_digest_enabled) : current.daily_digest_enabled,
      daily_digest_time: body.daily_digest_time !== undefined ? body.daily_digest_time : current.daily_digest_time,
      daily_digest_email: body.daily_digest_email !== undefined ? body.daily_digest_email : current.daily_digest_email,
      bkash_api_url: body.bkash_api_url !== undefined ? body.bkash_api_url : current.bkash_api_url,
      bkash_app_key: body.bkash_app_key !== undefined ? body.bkash_app_key : current.bkash_app_key,
      bkash_app_secret: body.bkash_app_secret !== undefined ? body.bkash_app_secret : current.bkash_app_secret,
      bkash_username: body.bkash_username !== undefined ? body.bkash_username : current.bkash_username,
      bkash_password: body.bkash_password !== undefined ? body.bkash_password : current.bkash_password,
      pathao_enabled: body.pathao_enabled !== undefined ? Boolean(body.pathao_enabled) : current.pathao_enabled,
      steadfast_enabled: body.steadfast_enabled !== undefined ? Boolean(body.steadfast_enabled) : current.steadfast_enabled,
      active_shipping_provider: body.active_shipping_provider || current.active_shipping_provider || 'pathao',
      pathao_api_url: body.pathao_api_url !== undefined ? body.pathao_api_url : current.pathao_api_url,
      pathao_client_id: body.pathao_client_id !== undefined ? body.pathao_client_id : current.pathao_client_id,
      pathao_client_secret: body.pathao_client_secret !== undefined ? body.pathao_client_secret : current.pathao_client_secret,
      pathao_username: body.pathao_username !== undefined ? body.pathao_username : current.pathao_username,
      pathao_password: body.pathao_password !== undefined ? body.pathao_password : current.pathao_password,
      pathao_store_id: body.pathao_store_id !== undefined ? body.pathao_store_id : current.pathao_store_id,
      steadfast_api_key: body.steadfast_api_key !== undefined ? body.steadfast_api_key : current.steadfast_api_key,
      steadfast_secret_key: body.steadfast_secret_key !== undefined ? body.steadfast_secret_key : current.steadfast_secret_key,
      steadfast_base_url: body.steadfast_base_url !== undefined ? body.steadfast_base_url : current.steadfast_base_url,
      store_city_name: body.store_city_name !== undefined ? body.store_city_name : current.store_city_name,
      store_city_id: Number(body.store_city_id ?? current.store_city_id),
      shipping_zone_1_label: body.shipping_zone_1_label !== undefined ? body.shipping_zone_1_label : current.shipping_zone_1_label,
      shipping_zone_2_label: body.shipping_zone_2_label !== undefined ? body.shipping_zone_2_label : current.shipping_zone_2_label,
      delivery_charge_inside_dhaka: Number(body.delivery_charge_inside_dhaka ?? current.delivery_charge_inside_dhaka),
      delivery_charge_outside_dhaka: Number(body.delivery_charge_outside_dhaka ?? current.delivery_charge_outside_dhaka),
      about_enabled: body.about_enabled !== undefined ? Boolean(body.about_enabled) : current.about_enabled,
      about_story: body.about_story !== undefined ? body.about_story : current.about_story,
      contact_phone: body.contact_phone !== undefined ? body.contact_phone : current.contact_phone,
      contact_whatsapp: body.contact_whatsapp !== undefined ? body.contact_whatsapp : current.contact_whatsapp,
      contact_email: body.contact_email !== undefined ? body.contact_email : current.contact_email,
      contact_address: body.contact_address !== undefined ? body.contact_address : current.contact_address,
      google_map_embed_url: body.google_map_embed_url !== undefined ? body.google_map_embed_url : current.google_map_embed_url,
      social_facebook: body.social_facebook !== undefined ? formatExternalUrl(body.social_facebook) : current.social_facebook,
      social_instagram: body.social_instagram !== undefined ? formatExternalUrl(body.social_instagram) : current.social_instagram,
      social_youtube: body.social_youtube !== undefined ? formatExternalUrl(body.social_youtube) : current.social_youtube,
      social_tiktok: body.social_tiktok !== undefined ? formatExternalUrl(body.social_tiktok) : current.social_tiktok,
      social_twitter: body.social_twitter !== undefined ? formatExternalUrl(body.social_twitter) : current.social_twitter,
      social_linkedin: body.social_linkedin !== undefined ? formatExternalUrl(body.social_linkedin) : current.social_linkedin,
      meta_pixel_id: body.meta_pixel_id !== undefined ? body.meta_pixel_id.trim() : current.meta_pixel_id,
      meta_conversions_api_token: body.meta_conversions_api_token !== undefined ? body.meta_conversions_api_token.trim() : current.meta_conversions_api_token,
      meta_test_event_code: body.meta_test_event_code !== undefined ? body.meta_test_event_code.trim() : current.meta_test_event_code,
      meta_domain_verification: body.meta_domain_verification !== undefined ? body.meta_domain_verification.trim() : current.meta_domain_verification,
      google_analytics_id: body.google_analytics_id !== undefined ? body.google_analytics_id.trim() : current.google_analytics_id,
      google_tag_manager_id: body.google_tag_manager_id !== undefined ? body.google_tag_manager_id.trim() : current.google_tag_manager_id,
      google_site_verification: body.google_site_verification !== undefined ? body.google_site_verification.trim() : current.google_site_verification,
      tiktok_pixel_id: body.tiktok_pixel_id !== undefined ? body.tiktok_pixel_id.trim() : current.tiktok_pixel_id,
      tiktok_events_api_token: body.tiktok_events_api_token !== undefined ? body.tiktok_events_api_token.trim() : current.tiktok_events_api_token,
      custom_head_scripts: body.custom_head_scripts !== undefined ? body.custom_head_scripts : current.custom_head_scripts,
      show_featured: body.show_featured !== undefined ? Boolean(body.show_featured) : current.show_featured,
      show_best_seller: body.show_best_seller !== undefined ? Boolean(body.show_best_seller) : current.show_best_seller,
      show_trending: body.show_trending !== undefined ? Boolean(body.show_trending) : current.show_trending,
      auto_best_seller: body.auto_best_seller !== undefined ? Boolean(body.auto_best_seller) : current.auto_best_seller,
      auto_trending: body.auto_trending !== undefined ? Boolean(body.auto_trending) : current.auto_trending,
      invoice_print_colorful: body.invoice_print_colorful !== undefined ? Boolean(body.invoice_print_colorful) : current.invoice_print_colorful,
      hero_overlay_opacity: body.hero_overlay_opacity !== undefined
        ? Math.min(100, Math.max(0, Number(body.hero_overlay_opacity) || 0))
        : current.hero_overlay_opacity,
      showcase_overlay_opacity: body.showcase_overlay_opacity !== undefined
        ? Math.min(100, Math.max(0, Number(body.showcase_overlay_opacity) || 0))
        : current.showcase_overlay_opacity,
      watermark_image_url: body.watermark_image_url !== undefined ? body.watermark_image_url : current.watermark_image_url,
      about_quality_title: body.about_quality_title !== undefined ? body.about_quality_title : current.about_quality_title,
      about_quality_desc: body.about_quality_desc !== undefined ? body.about_quality_desc : current.about_quality_desc,
      about_delivery_title: body.about_delivery_title !== undefined ? body.about_delivery_title : current.about_delivery_title,
      about_delivery_desc: body.about_delivery_desc !== undefined ? body.about_delivery_desc : current.about_delivery_desc,
      about_support_title: body.about_support_title !== undefined ? body.about_support_title : current.about_support_title,
      about_support_desc: body.about_support_desc !== undefined ? body.about_support_desc : current.about_support_desc,
      show_all_products: body.show_all_products !== undefined ? Boolean(body.show_all_products) : current.show_all_products,
      protect_images: body.protect_images !== undefined ? Boolean(body.protect_images) : current.protect_images,
      delivery_mode: body.delivery_mode !== undefined ? (body.delivery_mode === 'flat' ? 'flat' : 'zone') : current.delivery_mode,
      delivery_charge_flat: body.delivery_charge_flat !== undefined
        ? Math.max(0, Number(body.delivery_charge_flat) || 0)
        : current.delivery_charge_flat,
      updated_at: new Date().toISOString()
    }

    // Check if a settings row already exists
    const { data: existingRow } = await supabase
      .from('store_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    // Save, dropping any column the database doesn't have yet (migration not run)
    // so one missing column never blocks the rest of the settings from saving.
    const payload: Record<string, any> = { ...updatedPayload }
    const skippedColumns: string[] = []

    for (let attempt = 0; attempt < 20; attempt++) {
      const query = existingRow?.id
        ? supabase.from('store_settings').update(payload).eq('id', existingRow.id)
        : supabase.from('store_settings').insert({ id: '00000000-0000-0000-0000-000000000001', ...payload })

      const { error } = await query
      if (!error) break

      const missing = error.code === 'PGRST204' ? error.message?.match(/'([^']+)' column/)?.[1] : undefined
      if (!missing || !(missing in payload)) throw error
      delete payload[missing]
      skippedColumns.push(missing)
    }

    if (skippedColumns.length > 0) {
      console.warn('store_settings is missing columns (run the latest SQL migration):', skippedColumns.join(', '))
    }

    // Clear server in-memory cache
    invalidateSettingsCache()

    // Return the normalised settings (not the raw row) so the dashboard shows exactly what was stored
    const fresh = await getStoreSettings(true)
    return NextResponse.json({
      success: true,
      data: maskSecretSettings(fresh),
      ...(skippedColumns.length > 0
        ? { warning: `Some settings could not be saved until the latest SQL migration is run: ${skippedColumns.join(', ')}` }
        : {})
    })
  } catch (error: any) {
    console.error('Failed to update settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
