CREATE TYPE diagram_type_enum AS ENUM ('flowchart', 'sequence', 'class', 'component', 'state', 'activity');

ALTER TABLE biz_diagrams ALTER COLUMN diagram_type DROP DEFAULT;

ALTER TABLE biz_diagrams
  ALTER COLUMN diagram_type TYPE diagram_type_enum
  USING diagram_type::diagram_type_enum;

ALTER TABLE biz_diagrams
  ALTER COLUMN diagram_type SET DEFAULT 'flowchart'::diagram_type_enum;
