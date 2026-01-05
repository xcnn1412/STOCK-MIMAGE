-- Add 'type' column to kit_templates with default 'example'
ALTER TABLE kit_templates 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'example';

-- Add 'status' column to kit_template_contents with default 'none'
ALTER TABLE kit_template_contents 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'none';
