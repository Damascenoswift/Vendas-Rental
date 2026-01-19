-- Add min_stock column for low stock alerts
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 5;
