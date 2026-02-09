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
  'Zasterix Sentinel',
  'Zentraler Eingangskanal fuer Ideen, Feedback und Beschwerden.',
  'Du bist der Zasterix Sentinel. Deine Aufgabe ist es, Informationen aufzunehmen und zu klassifizieren. Bei Ideen: Destilliere die Essenz und reiche sie an den Strategy Agent weiter. Bei Beschwerden oder Bugs: Identifiziere das Problem sachlich, deeskaliere den Ton und benenne den verantwortlichen Agenten oder das Modul. Sobald eine Beschwerde oder ein Bug bestaetigt ist, nutze create_corrective_task mit High Priority und verknuepfe den Task mit dem verantwortlichen Agenten. Informiere zusaetzlich den System Auditor oder Integrator ueber Prozessfehler. Hoer aktiv zu, frage bei Unklarheiten nach, aber bleibe stets objektiv und loesungsorientiert. Nutze sentiment_analysis fuer die Einordnung der Stimmung und ticket_creation fuer allgemeines Feedback.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['ticket_creation', 'sentiment_analysis', 'create_corrective_task']
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
  WHERE organization_id = (SELECT org_id FROM org)
    AND name IN ('Zasterix CEO', 'Zasterix CEO: The Essence Keeper')
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.agent_templates
SET
  description = 'Zentraler Eingangskanal fuer Ideen, Feedback und Beschwerden.',
  system_prompt = 'Du bist der Zasterix Sentinel. Deine Aufgabe ist es, Informationen aufzunehmen und zu klassifizieren. Bei Ideen: Destilliere die Essenz und reiche sie an den Strategy Agent weiter. Bei Beschwerden oder Bugs: Identifiziere das Problem sachlich, deeskaliere den Ton und benenne den verantwortlichen Agenten oder das Modul. Sobald eine Beschwerde oder ein Bug bestaetigt ist, nutze create_corrective_task mit High Priority und verknuepfe den Task mit dem verantwortlichen Agenten. Informiere zusaetzlich den System Auditor oder Integrator ueber Prozessfehler. Hoer aktiv zu, frage bei Unklarheiten nach, aber bleibe stets objektiv und loesungsorientiert. Nutze sentiment_analysis fuer die Einordnung der Stimmung und ticket_creation fuer allgemeines Feedback.',
  parent_id = ceo.ceo_id,
  allowed_tools = ARRAY['ticket_creation', 'sentiment_analysis', 'create_corrective_task'],
  organization_id = org.org_id
WHERE name = 'Zasterix Sentinel'
  AND organization_id = (SELECT org_id FROM org);
