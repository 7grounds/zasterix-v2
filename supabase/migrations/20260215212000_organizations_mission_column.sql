ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS mission text;

UPDATE public.organizations
SET mission = COALESCE(mission, mission_text)
WHERE mission IS NULL
  AND mission_text IS NOT NULL;
