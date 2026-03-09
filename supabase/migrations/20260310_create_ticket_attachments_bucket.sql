-- ============================================================================
-- Ticket Attachments Storage Bucket
-- สร้าง bucket สำหรับเก็บไฟล์แนบของ Ticket (รูปภาพ, PDF, เอกสาร, ไฟล์บีบอัด)
-- ============================================================================

-- 1. Create bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ticket-attachments',
    'ticket-attachments',
    true,
    10485760, -- 10MB
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS policy — allow all authenticated users (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'ticket_attachments_all'
    ) THEN
        CREATE POLICY ticket_attachments_all
            ON storage.objects
            FOR ALL
            USING (bucket_id = 'ticket-attachments')
            WITH CHECK (bucket_id = 'ticket-attachments');
    END IF;
END $$;
