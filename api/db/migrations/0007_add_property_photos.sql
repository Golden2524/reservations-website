ALTER TABLE properties
  ADD COLUMN photo_urls TEXT[] NOT NULL DEFAULT '{}';
