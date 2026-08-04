-- Suporte: protocolo legível + notas de resolução + resolved_at

BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS protocol_code text,
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_protocol_seq START WITH 1001 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.set_support_ticket_protocol()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.protocol_code IS NULL OR btrim(NEW.protocol_code) = '' THEN
    NEW.protocol_code := 'SUP-' || lpad(nextval('public.support_ticket_protocol_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_protocol ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_protocol
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_ticket_protocol();

-- Backfill códigos faltantes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.support_tickets
    WHERE protocol_code IS NULL OR btrim(protocol_code) = ''
    ORDER BY created_at ASC
  LOOP
    UPDATE public.support_tickets
    SET protocol_code = 'SUP-' || lpad(nextval('public.support_ticket_protocol_seq')::text, 5, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_protocol_code
  ON public.support_tickets (protocol_code)
  WHERE protocol_code IS NOT NULL;

COMMENT ON COLUMN public.support_tickets.protocol_code IS 'Código legível do protocolo (ex.: SUP-01042).';
COMMENT ON COLUMN public.support_tickets.resolution_notes IS 'Notas do atendimento / resolução (master).';
COMMENT ON COLUMN public.support_tickets.resolved_at IS 'Quando o ticket foi marcado como resolvido.';

COMMIT;
