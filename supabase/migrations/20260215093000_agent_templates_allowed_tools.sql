ALTER TABLE public.agent_templates
ADD COLUMN IF NOT EXISTS allowed_tools text[] DEFAULT '{}'::text[];

UPDATE public.agent_templates
SET allowed_tools = '{}'::text[]
WHERE allowed_tools IS NULL;
