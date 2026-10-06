-- ==============================================================================
-- V8: Configurable hero "Shop Now" button link (Settings > Hero Banner)
-- Run once in the Supabase SQL Editor on existing sites. New sites get this
-- from supabase_setup.sql.
-- ==============================================================================

ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS hero_button_link TEXT DEFAULT '/products';

NOTIFY pgrst, 'reload schema';
