-- Add 'events' to allowed_modules for all users who have 'stock' 
-- This ensures existing users retain access to Events (previously part of Stock module)
UPDATE profiles
SET allowed_modules = array_append(allowed_modules, 'events')
WHERE 'stock' = ANY(allowed_modules)
  AND NOT ('events' = ANY(allowed_modules));

-- Add 'checkout' to allowed_modules for all users who have 'stock'
-- New module for equipment checkout/return
UPDATE profiles
SET allowed_modules = array_append(allowed_modules, 'checkout')
WHERE 'stock' = ANY(allowed_modules)
  AND NOT ('checkout' = ANY(allowed_modules));
