-- ============================================================================
-- Check-in Photos Storage Bucket
-- เก็บรูปถ่าย check-in ของพนักงาน (selfie ยืนยันตัวตน)
-- ============================================================================

-- 1. Create bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'checkin-photos',
    'checkin-photos',
    true,
    5242880, -- 5MB
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS policy — allow all (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'checkin_photos_all'
    ) THEN
        CREATE POLICY checkin_photos_all
            ON storage.objects
            FOR ALL
            USING (bucket_id = 'checkin-photos')
            WITH CHECK (bucket_id = 'checkin-photos');
    END IF;
END $$;
