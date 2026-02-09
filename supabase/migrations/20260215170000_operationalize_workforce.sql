ALTER TABLE public.agent_templates
ADD COLUMN IF NOT EXISTS is_operative boolean DEFAULT false;

UPDATE public.agent_templates
SET is_operative = false
WHERE is_operative IS NULL;

CREATE TABLE IF NOT EXISTS public.operative_tasks (
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
  response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

INSERT INTO public.organizations (name, slug)
SELECT 'Zasterix', 'zasterix'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizations
  WHERE name = 'Zasterix'
);

DO $$
DECLARE
  org_id uuid;
  ceo_demo_id uuid;
  ceo_demo_name text;
  ceo_demo_description text;
  ceo_demo_prompt text;
  ceo_demo_tools text[];
  ceo_op_id uuid;
  agent_name text;
BEGIN
  SELECT id INTO org_id FROM public.organizations WHERE name = 'Zasterix' LIMIT 1;

  SELECT id, name, description, system_prompt, allowed_tools
  INTO ceo_demo_id, ceo_demo_name, ceo_demo_description, ceo_demo_prompt, ceo_demo_tools
  FROM public.agent_templates
  WHERE organization_id = org_id
    AND name IN ('Zasterix CEO', 'Zasterix CEO: The Essence Keeper')
    AND (is_operative = false OR is_operative IS NULL)
  ORDER BY created_at ASC
  LIMIT 1;

  IF ceo_demo_id IS NOT NULL THEN
    SELECT id INTO ceo_op_id
    FROM public.agent_templates
    WHERE organization_id = org_id
      AND name = ceo_demo_name
      AND is_operative = true
    LIMIT 1;

    IF ceo_op_id IS NULL THEN
      INSERT INTO public.agent_templates (
        name,
        description,
        system_prompt,
        organization_id,
        parent_id,
        allowed_tools,
        is_operative
      )
      VALUES (
        ceo_demo_name,
        ceo_demo_description,
        ceo_demo_prompt,
        org_id,
        NULL,
        COALESCE(ceo_demo_tools, ARRAY[]::text[]),
        true
      )
      RETURNING id INTO ceo_op_id;
    END IF;
  END IF;

  FOREACH agent_name IN ARRAY ARRAY[
    'Zasterix CFO',
    'Zasterix CTO',
    'Zasterix COO',
    'Zasterix CMO',
    'Zasterix Sentinel',
    'Zasterix System Auditor',
    'Zasterix Intelligence Agent',
    'Zasterix Integrator',
    'Zasterix Growth Architect'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.agent_templates
      WHERE organization_id = org_id
        AND name = agent_name
        AND is_operative = true
    ) THEN
      INSERT INTO public.agent_templates (
        name,
        description,
        system_prompt,
        organization_id,
        parent_id,
        allowed_tools,
        is_operative
      )
      SELECT
        name,
        description,
        system_prompt,
        org_id,
        ceo_op_id,
        COALESCE(allowed_tools, ARRAY[]::text[]),
        true
      FROM public.agent_templates
      WHERE organization_id = org_id
        AND name = agent_name
        AND (is_operative = false OR is_operative IS NULL)
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END LOOP;

  UPDATE public.agent_templates
  SET allowed_tools = (
    SELECT ARRAY(
      SELECT DISTINCT UNNEST(
        COALESCE(allowed_tools, ARRAY[]::text[]) ||
        ARRAY['ticket_creation', 'sentiment_analysis', 'create_task_from_feedback']::text[]
      )
    )
  )
  WHERE organization_id = org_id
    AND name = 'Zasterix Sentinel';
END $$;
