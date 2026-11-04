-- custom: v_publish_blockers melacak aset stimulus Writing (questions_json[].stimulus_asset_code) - QA F-18-01.
-- Menggantikan definisi 0002 (kolom sama); cabang listening_asset_id tetap, cabang stimulus ditambah (DISTINCT per set/aset).
CREATE OR REPLACE VIEW "v_publish_blockers" AS
SELECT 'LEARNING_MATERIAL'::text AS entity_type,
       lm.id AS entity_id,
       'ASSET_UNVERIFIED'::text AS reason_code,
       ('asset ' || a.id::text)::text AS detail
FROM learning_materials lm
CROSS JOIN LATERAL (
  SELECT e->>'asset_id' AS aid
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(lm.videos_json) = 'array' THEN lm.videos_json ELSE '[]'::jsonb END) e
  UNION
  SELECT e->>'asset_id'
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(lm.slides_json) = 'array' THEN lm.slides_json ELSE '[]'::jsonb END) e
  UNION
  SELECT e->>'asset_id'
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(lm.attachments_json) = 'array' THEN lm.attachments_json ELSE '[]'::jsonb END) e
) refs
JOIN content_assets a ON a.id::text = refs.aid
WHERE a.rights_status = 'UNVERIFIED'
UNION ALL
SELECT 'ASSESSMENT_SET'::text, s.id, 'ASSET_UNVERIFIED'::text, ('asset ' || a.id::text)::text
FROM assessment_sets s
CROSS JOIN LATERAL (
  SELECT s.listening_asset_id::text AS aid WHERE s.listening_asset_id IS NOT NULL
  UNION
  SELECT a2.id::text
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.questions_json) = 'array' THEN s.questions_json ELSE '[]'::jsonb END) q
    JOIN content_assets a2 ON a2.asset_code = q->>'stimulus_asset_code'
) refs
JOIN content_assets a ON a.id::text = refs.aid
WHERE a.rights_status = 'UNVERIFIED'
UNION ALL
SELECT 'LEARNING_MATERIAL'::text, lm.id, 'SOURCE_MISSING'::text, 'origin OPEN_LICENSED_ADAPTED tanpa source_id'::text
FROM learning_materials lm
WHERE lm.origin = 'OPEN_LICENSED_ADAPTED' AND lm.source_id IS NULL
UNION ALL
SELECT 'ASSESSMENT_SET'::text, s.id, 'SOURCE_MISSING'::text, 'origin OPEN_LICENSED_ADAPTED tanpa source_id'::text
FROM assessment_sets s
WHERE s.origin = 'OPEN_LICENSED_ADAPTED' AND s.source_id IS NULL;
