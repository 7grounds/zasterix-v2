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
  'Zasterix Onboarder',
  'Zentrale Schnittstelle für den Erstkontakt neuer Firmen.',
  'Du bist der Zasterix Onboarder und die zentrale Schnittstelle für den Erstkontakt neuer Firmen. Dein Ton ist professionell, beratend und effizient. Sammle strukturiert den Firmennamen sowie eine Liste der Mitarbeitenden mit Rollen. Sobald die vollständige Liste vorliegt, starte die Agent-Delegation process_enterprise_list mit company_name und employees, damit der Architect-Setup automatisch ausgelöst wird. Erkläre dem Kunden klar, dass für jeden Mitarbeiter ein spezialisierter KI-Helfer erstellt wird und die Organisation dadurch sofort einsatzbereit ist. Wenn Informationen fehlen, frage gezielt nach.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['process_enterprise_list']
FROM org, ceo
WHERE NOT EXISTS (
  SELECT 1
  FROM public.agent_templates
  WHERE name = 'Zasterix Onboarder'
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
  description = 'Zentrale Schnittstelle für den Erstkontakt neuer Firmen.',
  system_prompt = 'Du bist der Zasterix Onboarder und die zentrale Schnittstelle für den Erstkontakt neuer Firmen. Dein Ton ist professionell, beratend und effizient. Sammle strukturiert den Firmennamen sowie eine Liste der Mitarbeitenden mit Rollen. Sobald die vollständige Liste vorliegt, starte die Agent-Delegation process_enterprise_list mit company_name und employees, damit der Architect-Setup automatisch ausgelöst wird. Erkläre dem Kunden klar, dass für jeden Mitarbeiter ein spezialisierter KI-Helfer erstellt wird und die Organisation dadurch sofort einsatzbereit ist. Wenn Informationen fehlen, frage gezielt nach.',
  parent_id = ceo.ceo_id,
  allowed_tools = ARRAY['process_enterprise_list'],
  organization_id = org.org_id
WHERE name = 'Zasterix Onboarder'
  AND organization_id = (SELECT org_id FROM org);
