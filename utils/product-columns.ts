// Columns safe to send to the storefront. Never use select('*') for public pages:
// it would ship internal fields such as buying_price (wholesale cost) to the browser.
export const PUBLIC_PRODUCT_COLUMNS =
  'id, category_id, name, slug, short_description, description, price, old_price, stock, images, variations, is_featured, is_best_seller, is_trending, is_hidden, created_at'
