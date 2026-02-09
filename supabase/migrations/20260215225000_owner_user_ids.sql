ALTER TABLE public.agent_templates
ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.knowledge_vault
ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.knowledge_vault
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
