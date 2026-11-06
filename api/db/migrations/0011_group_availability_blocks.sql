ALTER TABLE availability_blocks
  ADD COLUMN block_group_id UUID;

UPDATE availability_blocks
SET block_group_id = gen_random_uuid()
WHERE block_group_id IS NULL;

ALTER TABLE availability_blocks
  ALTER COLUMN block_group_id SET NOT NULL;

CREATE INDEX availability_blocks_group_idx ON availability_blocks (block_group_id);
