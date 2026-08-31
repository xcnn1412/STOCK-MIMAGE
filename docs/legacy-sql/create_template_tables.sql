-- Run this in your Supabase SQL Editor

CREATE TABLE kit_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE kit_template_contents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid REFERENCES kit_templates(id) ON DELETE CASCADE,
  item_name text NOT NULL
);
