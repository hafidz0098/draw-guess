-- ============================================================
-- Add optional category filter to rooms.
-- NULL / omitted = draw words from all categories (previous behavior).
-- ============================================================

ALTER TABLE public.rooms ADD COLUMN word_category TEXT;
