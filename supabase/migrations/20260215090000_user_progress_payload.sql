ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;

UPDATE public.user_progress
SET payload = '{}'::jsonb
WHERE payload IS NULL;
