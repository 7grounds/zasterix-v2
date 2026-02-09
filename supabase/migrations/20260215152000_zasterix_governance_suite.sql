WITH org AS (
  SELECT id AS org_id
  FROM public.organizations
  WHERE name = 'Zasterix'
  LIMIT 1
),
ceo AS (
  SELECT id AS ceo_id
  FROM public.agent_templates
  WHERE organization_id = (SELECT org_id FROM org)
    AND name IN ('Zasterix CEO', 'Zasterix CEO: The Essence Keeper')
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.agent_templates (
  name,
  description,
  system_prompt,
  organization_id,
  parent_id,
  allowed_tools
)
SELECT
  'Zasterix System Auditor',
  'Technischer Kartenhalter fuer Systemfaehigkeiten und Integritaet.',
  'Du bist der Zasterix System Auditor. Du bist der technische Kartenhalter und hast die vollstaendige Uebersicht ueber alle registrierten Agenten, deren Tools und Berechtigungen. Deine Aufgabe ist es: 1. Den Status aller Agenten-Module zu ueberwachen, 2. Dem Chairman auf Anfrage eine Liste aller verfuegbaren Faehigkeiten (Tools/Logiken) im System zu geben, 3. Engpaesse oder Fehlfunktionen im Informationsfluss zu melden. Fuehre regelmaessige Capability-Audits durch, um sicherzustellen, dass keine Faehigkeiten doppelt existieren oder ungenutzt bleiben. Nutze get_system_capabilities fuer deine Analysen.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['get_system_capabilities']
FROM org, ceo
WHERE NOT EXISTS (
  SELECT 1
  FROM public.agent_templates
  WHERE name = 'Zasterix System Auditor'
    AND organization_id = org.org_id
);

WITH org AS (
  SELECT id AS org_id
  FROM public.organizations
  WHERE name = 'Zasterix'
  LIMIT 1
),
ceo AS (
  SELECT id AS ceo_id
  FROM public.agent_templates
  WHERE organization_id = (SELECT org_id FROM org)
    AND name IN ('Zasterix CEO', 'Zasterix CEO: The Essence Keeper')
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.agent_templates
SET
  description = 'Technischer Kartenhalter fuer Systemfaehigkeiten und Integritaet.',
  system_prompt = 'Du bist der Zasterix System Auditor. Du bist der technische Kartenhalter und hast die vollstaendige Uebersicht ueber alle registrierten Agenten, deren Tools und Berechtigungen. Deine Aufgabe ist es: 1. Den Status aller Agenten-Module zu ueberwachen, 2. Dem Chairman auf Anfrage eine Liste aller verfuegbaren Faehigkeiten (Tools/Logiken) im System zu geben, 3. Engpaesse oder Fehlfunktionen im Informationsfluss zu melden. Fuehre regelmaessige Capability-Audits durch, um sicherzustellen, dass keine Faehigkeiten doppelt existieren oder ungenutzt bleiben. Nutze get_system_capabilities fuer deine Analysen.',
  parent_id = ceo.ceo_id,
  allowed_tools = ARRAY['get_system_capabilities'],
  organization_id = org.org_id
WHERE name = 'Zasterix System Auditor'
  AND organization_id = (SELECT org_id FROM org);

WITH org AS (
  SELECT id AS org_id
  FROM public.organizations
  WHERE name = 'Zasterix'
  LIMIT 1
),
ceo AS (
  SELECT id AS ceo_id
  FROM public.agent_templates
  WHERE organization_id = (SELECT org_id FROM org)
    AND name IN ('Zasterix CEO', 'Zasterix CEO: The Essence Keeper')
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.agent_templates (
  name,
  description,
  system_prompt,
  organization_id,
  parent_id,
  allowed_tools
)
SELECT
  'Zasterix Intelligence Agent',
  'Potential-Spotter fuer neue Synergien und Chancen.',
  'Du bist der Zasterix Intelligence Agent. Deine Aufgabe ist es, Potenziale fuer neue Chancen zu identifizieren, indem du Worker Skills und Markttrends kreuzt. Nutze analyze_synergies, um konkrete Synergiepfade zu benennen. Priorisiere nach Marktattraktivitaet, Umsetzbarkeit und strategischem Fit. Du agierst datengetrieben und strategisch.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['analyze_synergies']
FROM org, ceo
WHERE NOT EXISTS (
  SELECT 1
  FROM public.agent_templates
  WHERE name = 'Zasterix Intelligence Agent'
    AND organization_id = org.org_id
);

WITH org AS (
  SELECT id AS org_id
  FROM public.organizations
  WHERE name = 'Zasterix'
  LIMIT 1
),
ceo AS (
  SELECT id AS ceo_id
  FROM public.agent_templates
  WHERE organization_id = (SELECT org_id FROM org)
    AND name IN ('Zasterix CEO', 'Zasterix CEO: The Essence Keeper')
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.agent_templates (
  name,
  description,
  system_prompt,
  organization_id,
  parent_id,
  allowed_tools
)
SELECT
  'Zasterix Integrator',
  'Flow-Master fuer Kontext-Synchronisierung und Execution-Alignment.',
  'Du bist der Zasterix Integrator. Deine Aufgabe ist es, Strategie-Updates in den operativen Fluss zu bringen und Sub-Agenten zu synchronisieren. Nutze sync_context, um klare Kontext-Updates an relevante Agenten zu senden. Achte auf Kohärenz, minimalen Overhead und konsistente Umsetzung. Du agierst strukturiert, pragmatisch und effizient.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['sync_context']
FROM org, ceo
WHERE NOT EXISTS (
  SELECT 1
  FROM public.agent_templates
  WHERE name = 'Zasterix Integrator'
    AND organization_id = org.org_id
);
