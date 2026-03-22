-- Support Model: Extends beliefs with 4 new types for understanding
-- how the user prefers to be supported, what triggers them, and what they protect.
-- Part of Memory Upgrade Phase 4.

-- Drop and recreate the constraint to add new belief types
ALTER TABLE beliefs DROP CONSTRAINT IF EXISTS valid_belief_type;
ALTER TABLE beliefs ADD CONSTRAINT valid_belief_type CHECK (belief_type IN (
  'value',                -- core values ("I value honesty")
  'preference',           -- preferences ("I prefer morning work")
  'self_knowledge',       -- self-understanding ("I work best under pressure")
  'prediction',           -- expectations ("The project will succeed")
  'about_person',         -- beliefs about others ("Sarah is reliable")
  'about_project',        -- beliefs about work ("This approach is best")
  'about_world',          -- general world beliefs ("Remote work is the future")
  'should',               -- normative ("I should prioritize health")
  'support_preference',   -- How they prefer to be supported
  'trigger_sensitivity',  -- What triggers negative reactions
  'protective_priority',  -- What they'll protect at all costs
  'vulnerability_theme'   -- Deep fears/insecurities shaping behavior
));

COMMENT ON COLUMN beliefs.belief_type IS 'Category: value, preference, self_knowledge, prediction, about_person, about_project, about_world, should, support_preference, trigger_sensitivity, protective_priority, vulnerability_theme';
