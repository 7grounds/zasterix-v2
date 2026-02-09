CREATE TABLE IF NOT EXISTS public.knowledge_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content jsonb NOT NULL,
  category text NOT NULL,
  verified_by_auditor boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
