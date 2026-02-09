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
  WHERE organization_id = org_id
    AND name IN ('Zasterix CEO', 'Zasterix CEO: The Essence Keeper')
  ORDER BY created_at ASC
  LIMIT 1;

  IF ceo_id IS NULL THEN
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
      'Zasterix CEO',
      'Strategy Agent (CEO) for mission-to-task orchestration.',
      'You are the Strategy Agent (CEO). Translate each mission into 3-5 strategic milestones. Always respond with a create_task tool call using a tasks array (title, description, priority, agent_name). Keep it concise and actionable.',
      org_id,
      NULL,
      ARRAY['create_task']::text[],
      true
    )
    RETURNING id INTO ceo_id;
  ELSE
    UPDATE public.agent_templates
    SET
      description = 'Strategy Agent (CEO) for mission-to-task orchestration.',
      system_prompt = 'You are the Strategy Agent (CEO). Translate each mission into 3-5 strategic milestones. Always respond with a create_task tool call using a tasks array (title, description, priority, agent_name). Keep it concise and actionable.',
      allowed_tools = ARRAY['create_task']::text[],
      is_operative = true,
      organization_id = org_id
    WHERE id = ceo_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix Integrator'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Integrator Agent (Flow) coordinating execution.',
      system_prompt = 'You are the Integrator Agent (Flow). Coordinate execution across agents, sync context, and keep delivery cohesive and minimal.',
      allowed_tools = ARRAY['sync_context']::text[],
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix Integrator';
  ELSE
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
      'Zasterix Integrator',
      'Integrator Agent (Flow) coordinating execution.',
      'You are the Integrator Agent (Flow). Coordinate execution across agents, sync context, and keep delivery cohesive and minimal.',
      org_id,
      ceo_id,
      ARRAY['sync_context']::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix Growth Architect'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Growth Agent (Expansion) for market and traction.',
      system_prompt = 'You are the Growth Agent (Expansion). Focus on market expansion, validation, and growth experiments. Keep output concise and data-driven.',
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix Growth Architect';
  ELSE
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
      'Zasterix Growth Architect',
      'Growth Agent (Expansion) for market and traction.',
      'You are the Growth Agent (Expansion). Focus on market expansion, validation, and growth experiments. Keep output concise and data-driven.',
      org_id,
      ceo_id,
      ARRAY[]::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix Sentinel'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Sentinel Agent (Intake) for ideas and complaints.',
      system_prompt = 'You are the Sentinel Agent (Intake). Classify incoming ideas, feedback, or complaints. Use sentiment_analysis and create_task_from_feedback to log issues, and provide calm acknowledgements when asked.',
      allowed_tools = ARRAY['sentiment_analysis', 'create_task_from_feedback', 'ticket_creation']::text[],
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix Sentinel';
  ELSE
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
      'Zasterix Sentinel',
      'Sentinel Agent (Intake) for ideas and complaints.',
      'You are the Sentinel Agent (Intake). Classify incoming ideas, feedback, or complaints. Use sentiment_analysis and create_task_from_feedback to log issues, and provide calm acknowledgements when asked.',
      org_id,
      ceo_id,
      ARRAY['sentiment_analysis', 'create_task_from_feedback', 'ticket_creation']::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix System Auditor'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Auditor Agent (Librarian/Tech) for knowledge curation.',
      system_prompt = 'You are the Auditor Agent (Librarian/Tech). Scan universal_history for key learnings and blueprints, then store them in the knowledge_vault. Use knowledge_vault_search and knowledge_vault_upsert, and mark verified_by_auditor when appropriate.',
      allowed_tools = ARRAY['universal_history', 'knowledge_vault_search', 'knowledge_vault_upsert', 'get_system_capabilities']::text[],
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix System Auditor';
  ELSE
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
      'Zasterix System Auditor',
      'Auditor Agent (Librarian/Tech) for knowledge curation.',
      'You are the Auditor Agent (Librarian/Tech). Scan universal_history for key learnings and blueprints, then store them in the knowledge_vault. Use knowledge_vault_search and knowledge_vault_upsert, and mark verified_by_auditor when appropriate.',
      org_id,
      ceo_id,
      ARRAY['universal_history', 'knowledge_vault_search', 'knowledge_vault_upsert', 'get_system_capabilities']::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix Intelligence Agent'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Intelligence Agent (Synergy) for opportunity mapping.',
      system_prompt = 'You are the Intelligence Agent (Synergy). Cross-reference skills and market trends to spot opportunities.',
      allowed_tools = ARRAY['analyze_synergies']::text[],
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix Intelligence Agent';
  ELSE
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
      'Zasterix Intelligence Agent',
      'Intelligence Agent (Synergy) for opportunity mapping.',
      'You are the Intelligence Agent (Synergy). Cross-reference skills and market trends to spot opportunities.',
      org_id,
      ceo_id,
      ARRAY['analyze_synergies']::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix COO'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Operations Agent (Execution) for delivery.',
      system_prompt = 'You are the Operations Agent (Execution). Translate plans into delivery steps with minimal overhead.',
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix COO';
  ELSE
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
      'Zasterix COO',
      'Operations Agent (Execution) for delivery.',
      'You are the Operations Agent (Execution). Translate plans into delivery steps with minimal overhead.',
      org_id,
      ceo_id,
      ARRAY[]::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix CFO'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Financial Agent (CFO) for feasibility and budget.',
      system_prompt = 'You are the Financial Agent (CFO). Provide budget, pricing, and feasibility checks.',
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix CFO';
  ELSE
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
      'Zasterix CFO',
      'Financial Agent (CFO) for feasibility and budget.',
      'You are the Financial Agent (CFO). Provide budget, pricing, and feasibility checks.',
      org_id,
      ceo_id,
      ARRAY[]::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix CMO'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Messaging Agent (CMO) for positioning.',
      system_prompt = 'You are the Messaging Agent (CMO). Craft clear messaging and positioning.',
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix CMO';
  ELSE
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
      'Zasterix CMO',
      'Messaging Agent (CMO) for positioning.',
      'You are the Messaging Agent (CMO). Craft clear messaging and positioning.',
      org_id,
      ceo_id,
      ARRAY[]::text[],
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_templates WHERE organization_id = org_id AND name = 'Zasterix CTO'
  ) THEN
    UPDATE public.agent_templates
    SET
      description = 'Architectural Agent (CTO) for technical delivery.',
      system_prompt = 'You are the Architectural Agent (CTO). Propose minimal, scalable technical paths.',
      parent_id = ceo_id,
      is_operative = true
    WHERE organization_id = org_id AND name = 'Zasterix CTO';
  ELSE
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
      'Zasterix CTO',
      'Architectural Agent (CTO) for technical delivery.',
      'You are the Architectural Agent (CTO). Propose minimal, scalable technical paths.',
      org_id,
      ceo_id,
      ARRAY[]::text[],
      true
    );
  END IF;
END $$;
