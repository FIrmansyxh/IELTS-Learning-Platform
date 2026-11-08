-- custom: view penghalang publikasi (aset belum terverifikasi / sumber hilang)
CREATE VIEW `v_publish_blockers` AS
SELECT 'LEARNING_MATERIAL' AS entity_type, lm.id AS entity_id, 'ASSET_UNVERIFIED' AS reason_code, 'asset ' || a.id AS detail
FROM learning_materials lm
JOIN (
  SELECT m.id AS lm_id, json_extract(e.value, '$.asset_id') AS aid
    FROM learning_materials m, json_each(CASE WHEN json_valid(m.videos_json) AND json_type(m.videos_json) = 'array' THEN m.videos_json ELSE '[]' END) e
  UNION
  SELECT m.id, json_extract(e.value, '$.asset_id')
    FROM learning_materials m, json_each(CASE WHEN json_valid(m.slides_json) AND json_type(m.slides_json) = 'array' THEN m.slides_json ELSE '[]' END) e
  UNION
  SELECT m.id, json_extract(e.value, '$.asset_id')
    FROM learning_materials m, json_each(CASE WHEN json_valid(m.attachments_json) AND json_type(m.attachments_json) = 'array' THEN m.attachments_json ELSE '[]' END) e
) refs ON refs.lm_id = lm.id
JOIN content_assets a ON a.id = refs.aid
WHERE a.rights_status = 'UNVERIFIED'
UNION ALL
SELECT 'ASSESSMENT_SET', s.id, 'ASSET_UNVERIFIED', 'asset ' || a.id
FROM assessment_sets s JOIN content_assets a ON a.id = s.listening_asset_id
WHERE a.rights_status = 'UNVERIFIED'
UNION ALL
SELECT 'LEARNING_MATERIAL', lm.id, 'SOURCE_MISSING', 'origin OPEN_LICENSED_ADAPTED tanpa source_id'
FROM learning_materials lm WHERE lm.origin = 'OPEN_LICENSED_ADAPTED' AND lm.source_id IS NULL
UNION ALL
SELECT 'ASSESSMENT_SET', s.id, 'SOURCE_MISSING', 'origin OPEN_LICENSED_ADAPTED tanpa source_id'
FROM assessment_sets s WHERE s.origin = 'OPEN_LICENSED_ADAPTED' AND s.source_id IS NULL;
