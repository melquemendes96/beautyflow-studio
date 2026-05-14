-- Bucket público para logos, banners e imagens de serviços (paths: {company_id}/...).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-media',
  'company-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública (URLs getPublicUrl)
DROP POLICY IF EXISTS "Public read company-media" ON storage.objects;
CREATE POLICY "Public read company-media"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'company-media');

-- Membros da empresa gravam apenas na pasta do próprio company_id
DROP POLICY IF EXISTS "Company members upload company-media" ON storage.objects;
CREATE POLICY "Company members upload company-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-media'
    AND split_part(name, '/', 1) IN (
      SELECT cu.company_id::text FROM public.company_users cu WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Company members update company-media" ON storage.objects;
CREATE POLICY "Company members update company-media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-media'
    AND split_part(name, '/', 1) IN (
      SELECT cu.company_id::text FROM public.company_users cu WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Company members delete company-media" ON storage.objects;
CREATE POLICY "Company members delete company-media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-media'
    AND split_part(name, '/', 1) IN (
      SELECT cu.company_id::text FROM public.company_users cu WHERE cu.user_id = auth.uid()
    )
  );
