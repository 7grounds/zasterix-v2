WITH org AS (
  SELECT id AS org_id
  FROM public.organizations
  WHERE name = 'Zasterix'
  LIMIT 1
),
ceo AS (
  SELECT id AS ceo_id
  FROM public.agent_templates
  WHERE name = 'Zasterix CEO'
    AND organization_id = (SELECT org_id FROM org)
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
  'Zentraler Monitor fuer Systemfaehigkeiten und Integritaet.',
  'Du bist der Zasterix System Auditor. Du hast die vollstaendige Uebersicht ueber alle registrierten Agenten, deren Tools und deren Berechtigungen. Deine Aufgabe ist es: 1. Den Status aller Agenten-Module zu ueberwachen, 2. Dem Chairman auf Anfrage eine Liste aller verfuegbaren Faehigkeiten (Tools/Logiken) im System zu geben, 3. Engpaesse oder Fehlfunktionen im Informationsfluss zu melden. Fuehre regelmaessige Capability-Audits durch, um sicherzustellen, dass keine Faehigkeiten doppelt existieren oder ungenutzt bleiben. Du agierst professionell, datengetrieben und strategisch.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['agent_templates', 'tool_registry']
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
  WHERE name = 'Zasterix CEO'
    AND organization_id = (SELECT org_id FROM org)
  LIMIT 1
)
UPDATE public.agent_templates
SET
  description = 'Zentraler Monitor fuer Systemfaehigkeiten und Integritaet.',
  system_prompt = 'Du bist der Zasterix System Auditor. Du hast die vollstaendige Uebersicht ueber alle registrierten Agenten, deren Tools und deren Berechtigungen. Deine Aufgabe ist es: 1. Den Status aller Agenten-Module zu ueberwachen, 2. Dem Chairman auf Anfrage eine Liste aller verfuegbaren Faehigkeiten (Tools/Logiken) im System zu geben, 3. Engpaesse oder Fehlfunktionen im Informationsfluss zu melden. Fuehre regelmaessige Capability-Audits durch, um sicherzustellen, dass keine Faehigkeiten doppelt existieren oder ungenutzt bleiben. Du agierst professionell, datengetrieben und strategisch.',
  parent_id = ceo.ceo_id,
  allowed_tools = ARRAY['agent_templates', 'tool_registry'],
  organization_id = org.org_id
WHERE name = 'Zasterix System Auditor'
  AND organization_id = (SELECT org_id FROM org);
