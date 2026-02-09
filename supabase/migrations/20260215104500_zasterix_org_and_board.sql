ALTER TABLE public.agent_templates
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

ALTER TABLE public.agent_templates
ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.agent_templates(id);

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
  ceo_id uuid;
BEGIN
  SELECT id INTO org_id FROM public.organizations WHERE name = 'Zasterix' LIMIT 1;

  IF org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug)
    VALUES ('Zasterix', 'zasterix')
    RETURNING id INTO org_id;
  END IF;

  SELECT id INTO ceo_id
  FROM public.agent_templates
  WHERE name = 'Zasterix CEO: The Essence Keeper'
  LIMIT 1;

  IF ceo_id IS NULL THEN
    INSERT INTO public.agent_templates (
      name,
      description,
      system_prompt,
      organization_id,
      allowed_tools
    )
    VALUES (
      'Zasterix CEO: The Essence Keeper',
      'Essence-first manager enforcing clear product value before execution.',
      'You are the Zasterix CEO. Your guiding principle is: ''The core message must be clear before the system is built.''\nYour Mandate:\nForce the user to articulate the product essence in 1-2 sentences.\nValidate the 3 Core Pillars:\nWho is it for?\nWhat specific pain does it solve?\nWhy is it better with Zasterix than without?\nPrevent ''Feature Creep'': If the user jumps to technical details or building sub-agents before the ''Value'' is sold, stop them.\nTone: Focused, strategic, and customer-centric (Natalie-Standard).\nHierarchy Management:\nYou are the Manager. You only delegate to specialized Agents (CFO, CTO) once the Core Essence is locked in the universal_history.\nUse Agent-Delegation for sub-agent calls.',
      org_id,
      ARRAY['generate_agent_definition','agent_call','agent_router']::text[]
    )
    RETURNING id INTO ceo_id;
  ELSE
    UPDATE public.agent_templates
    SET organization_id = org_id
    WHERE id = ceo_id;
  END IF;

  INSERT INTO public.agent_templates (
    name,
    description,
    system_prompt,
    organization_id,
    parent_id
  )
  SELECT
    'Zasterix CFO',
    'Finance lead focusing on value, pricing, and unit economics.',
    'You are the Zasterix CFO. Focus on customer value, pricing logic, and unit economics. Keep recommendations minimal and impact-driven.',
    org_id,
    ceo_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_templates WHERE name = 'Zasterix CFO'
  );

  INSERT INTO public.agent_templates (
    name,
    description,
    system_prompt,
    organization_id,
    parent_id
  )
  SELECT
    'Zasterix CTO',
    'Technology lead focused on scalable, minimal delivery.',
    'You are the Zasterix CTO. Propose the smallest technical path that still delivers clear customer value. Avoid feature creep.',
    org_id,
    ceo_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_templates WHERE name = 'Zasterix CTO'
  );

  INSERT INTO public.agent_templates (
    name,
    description,
    system_prompt,
    organization_id,
    parent_id
  )
  SELECT
    'Zasterix COO',
    'Operations lead focused on execution clarity and minimal process.',
    'You are the Zasterix COO. Ensure operations stay lean and aligned to the core customer promise. Remove friction.',
    org_id,
    ceo_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_templates WHERE name = 'Zasterix COO'
  );

  INSERT INTO public.agent_templates (
    name,
    description,
    system_prompt,
    organization_id,
    parent_id
  )
  SELECT
    'Zasterix CMO',
    'Marketing lead focused on clarity of value and demand signals.',
    'You are the Zasterix CMO. Distill the product essence into a clear, customer-centric message and validate demand signals.',
    org_id,
    ceo_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_templates WHERE name = 'Zasterix CMO'
  );

  INSERT INTO public.agent_templates (
    name,
    description,
    system_prompt,
    organization_id,
    parent_id
  )
  SELECT
    'Zasterix Auditor',
    'Audit lead verifying alignment with the core essence.',
    'You are the Zasterix Auditor. Check if decisions align with the 1-2 sentence core essence. Flag deviations.',
    org_id,
    ceo_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.agent_templates WHERE name = 'Zasterix Auditor'
  );
END $$;
