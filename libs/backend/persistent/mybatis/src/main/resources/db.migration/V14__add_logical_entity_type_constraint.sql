-- Add CHECK constraint to limit logical_entities.type to valid enum values
ALTER TABLE logical_entities 
ADD CONSTRAINT chk_logical_entity_type 
CHECK (type IN ('Evidence', 'Participant', 'Role', 'Context'));
