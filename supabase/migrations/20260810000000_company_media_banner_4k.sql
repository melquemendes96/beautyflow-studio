-- Permite capas Full HD / 4K no Storage (WebP comprimido no cliente ainda fica leve).
UPDATE storage.buckets
SET file_size_limit = 12582912 -- 12 MB
WHERE id = 'company-media';
