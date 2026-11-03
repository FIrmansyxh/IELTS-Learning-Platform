-- custom: view penghalang publikasi + hak akses peran runtime
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
JOIN content_assets a ON a.id = s.listening_asset_id
WHERE a.rights_status = 'UNVERIFIED'
UNION ALL
SELECT 'LEARNING_MATERIAL'::text, lm.id, 'SOURCE_MISSING'::text, 'origin OPEN_LICENSED_ADAPTED tanpa source_id'::text
FROM learning_materials lm
WHERE lm.origin = 'OPEN_LICENSED_ADAPTED' AND lm.source_id IS NULL
UNION ALL
SELECT 'ASSESSMENT_SET'::text, s.id, 'SOURCE_MISSING'::text, 'origin OPEN_LICENSED_ADAPTED tanpa source_id'::text
FROM assessment_sets s
WHERE s.origin = 'OPEN_LICENSED_ADAPTED' AND s.source_id IS NULL;
--> statement-breakpoint
-- Hak akses app_rw. Dilewati bila role belum ada (mis. Postgres CI tanpa skrip init).
-- audit_log dan point_ledger bersifat append-only: UPDATE/DELETE dicabut.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT USAGE ON SCHEMA public TO app_rw;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
    REVOKE UPDATE, DELETE ON audit_log, point_ledger FROM app_rw;
  END IF;
END
$$;
