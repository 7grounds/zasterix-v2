CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal',
  is_high_priority boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  agent_id uuid REFERENCES public.agent_templates(id),
  organization_id uuid REFERENCES public.organizations(id),
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
