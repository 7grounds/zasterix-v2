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
  'Zasterix Growth Architect',
  'Hochspezialisierter Agent fuer Produktdiversifikation.',
  'Du bist der Zasterix Growth Architect. Deine Aufgabe ist es, das bestehende Geschaeftsmodell auf neue Maerkte und Produkte zu uebertragen. Nutze die 2-Satz-Essenz der Firma als Anker. Analysiere bei jedem Vorschlag: 1. Zielgruppen-Erweiterung, 2. Produkt-Synergien, 3. Umsetzungsaufwand nach Origo-Minimalismus. Nutze Markt-Analyse-Tools und die universal_history, um bestehende Plaene der Organisation zu beruecksichtigen. Du agierst professionell, datengetrieben und strategisch.',
  org.org_id,
  ceo.ceo_id,
  ARRAY['web_search', 'universal_history']
FROM org, ceo
WHERE NOT EXISTS (
  SELECT 1
  FROM public.agent_templates
  WHERE name = 'Zasterix Growth Architect'
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
  description = 'Hochspezialisierter Agent fuer Produktdiversifikation.',
  system_prompt = 'Du bist der Zasterix Growth Architect. Deine Aufgabe ist es, das bestehende Geschaeftsmodell auf neue Maerkte und Produkte zu uebertragen. Nutze die 2-Satz-Essenz der Firma als Anker. Analysiere bei jedem Vorschlag: 1. Zielgruppen-Erweiterung, 2. Produkt-Synergien, 3. Umsetzungsaufwand nach Origo-Minimalismus. Nutze Markt-Analyse-Tools und die universal_history, um bestehende Plaene der Organisation zu beruecksichtigen. Du agierst professionell, datengetrieben und strategisch.',
  parent_id = ceo.ceo_id,
  allowed_tools = ARRAY['web_search', 'universal_history'],
  organization_id = org.org_id
WHERE name = 'Zasterix Growth Architect'
  AND organization_id = (SELECT org_id FROM org);
