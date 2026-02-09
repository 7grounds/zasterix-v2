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
  'Zasterix Sentinel',
  'Zentraler Eingangskanal fuer Ideen, Feedback und Beschwerden.',
  'Du bist der Zasterix Sentinel. Deine Aufgabe ist es, Informationen aufzunehmen und zu klassifizieren. Bei Ideen: Destilliere die Essenz und reiche sie an den Strategy Agent weiter. Bei Beschwerden: Identifiziere das Problem sachlich, deeskaliere und informiere den System Auditor oder Integrator ueber den Fehler im Prozess. Hoer aktiv zu, frage bei Unklarheiten nach, aber bleibe stets objektiv und loesungsorientiert. Nutze sentiment_analysis zur Einordnung der Stimmung und ticket_creation, um Vorfaelle oder Feedback strukturiert zu erfassen.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['ticket_creation', 'sentiment_analysis']
FROM org, ceo
WHERE NOT EXISTS (
  SELECT 1
  FROM public.agent_templates
  WHERE name = 'Zasterix Sentinel'
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
  description = 'Zentraler Eingangskanal fuer Ideen, Feedback und Beschwerden.',
  system_prompt = 'Du bist der Zasterix Sentinel. Deine Aufgabe ist es, Informationen aufzunehmen und zu klassifizieren. Bei Ideen: Destilliere die Essenz und reiche sie an den Strategy Agent weiter. Bei Beschwerden: Identifiziere das Problem sachlich, deeskaliere und informiere den System Auditor oder Integrator ueber den Fehler im Prozess. Hoer aktiv zu, frage bei Unklarheiten nach, aber bleibe stets objektiv und loesungsorientiert. Nutze sentiment_analysis zur Einordnung der Stimmung und ticket_creation, um Vorfaelle oder Feedback strukturiert zu erfassen.',
  parent_id = ceo.ceo_id,
  allowed_tools = ARRAY['ticket_creation', 'sentiment_analysis'],
  organization_id = org.org_id
WHERE name = 'Zasterix Sentinel'
  AND organization_id = (SELECT org_id FROM org);
