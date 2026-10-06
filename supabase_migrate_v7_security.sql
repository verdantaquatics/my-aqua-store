-- ==============================================================================
-- V7: SECURITY HARDENING + MISSING SETTINGS COLUMNS
-- Run this in the Supabase SQL Editor. Safe to run more than once.
--
-- Why: the earlier scripts created policies like `USING (true)` that let anyone
-- holding the public anon key read every order, customer and the store_settings
-- secrets, and let any signed-in user write to every table (including adding
-- themselves to staff_members).
--
-- After this migration the browser/anon key can only:
--   * read categories and products (without buying_price)
--   * let a signed-in staff member read their own staff_members row
-- Everything else goes through the server (service role), which bypasses RLS.
-- ==============================================================================

-- 1. DROP EVERY EXISTING POLICY ON THE APP TABLES
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
            'categories', 'products', 'orders', 'order_items', 'store_settings',
            'staff_members', 'customers', 'wishlists', 'contact_messages',
            'promotions', 'promo_codes'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 2. MAKE SURE RLS IS ON EVERYWHERE (no policy = no access for anon/authenticated)
ALTER TABLE public.categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes      ENABLE ROW LEVEL SECURITY;

-- 3. PUBLIC READ-ONLY CATALOG
CREATE POLICY "Public read categories" ON public.categories
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read products" ON public.products
    FOR SELECT TO anon, authenticated USING (true);

-- Wholesale cost must never be readable with the public key
REVOKE SELECT ON public.products FROM anon, authenticated;
GRANT SELECT (
    id, category_id, name, slug, short_description, description, price, old_price,
    stock, images, variations, is_featured, is_best_seller, is_trending, is_hidden, created_at
) ON public.products TO anon, authenticated;

-- 4. STAFF CAN SEE ONLY THEIR OWN STAFF ROW (used to show the storefront admin pill)
CREATE POLICY "Staff read own row" ON public.staff_members
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- No write privileges at all for client keys on sensitive tables
REVOKE INSERT, UPDATE, DELETE ON public.staff_members, public.store_settings,
    public.orders, public.order_items, public.customers, public.wishlists,
    public.contact_messages, public.promotions, public.promo_codes,
    public.categories, public.products
FROM anon, authenticated;
REVOKE SELECT ON public.staff_members, public.store_settings FROM anon;

-- 5. STOCK FUNCTIONS: server only, and reject non-positive quantities
CREATE OR REPLACE FUNCTION public.decrement_product_stock(prod_id UUID, qty INT)
RETURNS VOID AS $$
BEGIN
    IF qty IS NULL OR qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive';
    END IF;
    UPDATE public.products SET stock = GREATEST(0, stock - qty) WHERE id = prod_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_product_stock(prod_id UUID, qty INT)
RETURNS VOID AS $$
BEGIN
    IF qty IS NULL OR qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive';
    END IF;
    UPDATE public.products SET stock = stock + qty WHERE id = prod_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_product_stock(UUID, INT) FROM PUBLIC, anon, authenticated;

-- 6. REMOVE THE PLACEHOLDER ADMIN SEED
-- An unclaimed staff row for a public address could be claimed by whoever registers it first.
DELETE FROM public.staff_members WHERE email = 'admin@example.com' AND user_id IS NULL;

-- 7. SETTINGS COLUMNS USED BY THE DASHBOARD BUT NEVER CREATED
ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS invoice_print_colorful   BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hero_overlay_opacity     INT     DEFAULT 35,
    ADD COLUMN IF NOT EXISTS showcase_overlay_opacity INT     DEFAULT 60,
    ADD COLUMN IF NOT EXISTS show_all_products        BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS protect_images           BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS delivery_mode            VARCHAR(10) DEFAULT 'zone',
    ADD COLUMN IF NOT EXISTS delivery_charge_flat     NUMERIC(10, 2) DEFAULT 100.00,
    ADD COLUMN IF NOT EXISTS watermark_image_url      TEXT    DEFAULT '',
    ADD COLUMN IF NOT EXISTS about_quality_title      TEXT    DEFAULT '',
    ADD COLUMN IF NOT EXISTS about_quality_desc       TEXT    DEFAULT '',
    ADD COLUMN IF NOT EXISTS about_delivery_title     TEXT    DEFAULT '',
    ADD COLUMN IF NOT EXISTS about_delivery_desc      TEXT    DEFAULT '',
    ADD COLUMN IF NOT EXISTS about_support_title      TEXT    DEFAULT '',
    ADD COLUMN IF NOT EXISTS about_support_desc       TEXT    DEFAULT '';

-- Refresh the PostgREST schema cache so the new columns are usable immediately
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- AFTER RUNNING, REVIEW THESE (the old policies allowed anyone to write here):
--   SELECT id, email, role, status, user_id, created_at FROM public.staff_members ORDER BY created_at;
--     -> delete any row you don't recognise.
--   Rotate every credential stored in store_settings (bKash, Pathao, Steadfast,
--   Resend, Meta/TikTok tokens): they were readable with the public key.
-- ==============================================================================
