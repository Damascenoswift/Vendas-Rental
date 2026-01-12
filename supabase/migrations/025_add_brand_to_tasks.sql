-- Migration 025: Add Brand to Tasks
-- Description: Adds a 'brand' column to tasks to distinguish between Rental and Dorata tasks.

BEGIN;

ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS brand TEXT CHECK (brand IN ('rental', 'dorata')) DEFAULT 'rental' NOT NULL;

-- Update existing tasks to be 'rental' (default handles new ones, but good to be explicit for existing)
UPDATE public.tasks SET brand = 'rental' WHERE brand IS NULL;

COMMIT;
