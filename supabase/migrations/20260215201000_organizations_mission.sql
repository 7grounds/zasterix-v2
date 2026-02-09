ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS mission_text text;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS mission_updated_at timestamptz;
