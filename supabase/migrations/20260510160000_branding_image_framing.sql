-- Enquadramento (object-position / background-position) para logo e banner na página pública e no admin.

ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS banner_image_pos_x double precision DEFAULT 50,
  ADD COLUMN IF NOT EXISTS banner_image_pos_y double precision DEFAULT 50,
  ADD COLUMN IF NOT EXISTS logo_image_pos_x double precision DEFAULT 50,
  ADD COLUMN IF NOT EXISTS logo_image_pos_y double precision DEFAULT 50;

UPDATE public.branding_settings
SET
  banner_image_pos_x = COALESCE(banner_image_pos_x, 50),
  banner_image_pos_y = COALESCE(banner_image_pos_y, 50),
  logo_image_pos_x = COALESCE(logo_image_pos_x, 50),
  logo_image_pos_y = COALESCE(logo_image_pos_y, 50)
WHERE TRUE;

ALTER TABLE public.branding_settings
  ALTER COLUMN banner_image_pos_x SET DEFAULT 50,
  ALTER COLUMN banner_image_pos_y SET DEFAULT 50,
  ALTER COLUMN logo_image_pos_x SET DEFAULT 50,
  ALTER COLUMN logo_image_pos_y SET DEFAULT 50;

ALTER TABLE public.branding_settings
  ALTER COLUMN banner_image_pos_x SET NOT NULL,
  ALTER COLUMN banner_image_pos_y SET NOT NULL,
  ALTER COLUMN logo_image_pos_x SET NOT NULL,
  ALTER COLUMN logo_image_pos_y SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branding_settings_banner_image_pos_x_check'
  ) THEN
    ALTER TABLE public.branding_settings
      ADD CONSTRAINT branding_settings_banner_image_pos_x_check
      CHECK (banner_image_pos_x >= 0 AND banner_image_pos_x <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branding_settings_banner_image_pos_y_check'
  ) THEN
    ALTER TABLE public.branding_settings
      ADD CONSTRAINT branding_settings_banner_image_pos_y_check
      CHECK (banner_image_pos_y >= 0 AND banner_image_pos_y <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branding_settings_logo_image_pos_x_check'
  ) THEN
    ALTER TABLE public.branding_settings
      ADD CONSTRAINT branding_settings_logo_image_pos_x_check
      CHECK (logo_image_pos_x >= 0 AND logo_image_pos_x <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branding_settings_logo_image_pos_y_check'
  ) THEN
    ALTER TABLE public.branding_settings
      ADD CONSTRAINT branding_settings_logo_image_pos_y_check
      CHECK (logo_image_pos_y >= 0 AND logo_image_pos_y <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.branding_settings.banner_image_pos_x IS 'Background/object position X % (0–100) for banner crop.';
COMMENT ON COLUMN public.branding_settings.banner_image_pos_y IS 'Background/object position Y % (0–100) for banner crop.';
COMMENT ON COLUMN public.branding_settings.logo_image_pos_x IS 'Object position X % (0–100) for logo crop.';
COMMENT ON COLUMN public.branding_settings.logo_image_pos_y IS 'Object position Y % (0–100) for logo crop.';
