-- Add significant_dates category to living_summaries
-- Phase 3: Story Engine - Significant Dates Summary

-- First, drop and recreate the constraint to include the new category
ALTER TABLE living_summaries DROP CONSTRAINT IF EXISTS valid_category;

ALTER TABLE living_summaries ADD CONSTRAINT valid_category CHECK (category IN (
  'personality',        -- identity, self-story, who you are
  'goals',              -- aspirations, what you're working toward
  'relationships',      -- people, social connections
  'projects',           -- active work, tasks
  'interests',          -- hobbies, passions
  'wellbeing',          -- health, mood, emotional patterns
  'commitments',        -- promises, obligations
  'significant_dates'   -- key dates and what they mean (birthdays, anniversaries, pivotal moments)
));

-- Insert the new category (if not exists)
INSERT INTO living_summaries (category, content)
VALUES ('significant_dates', '')
ON CONFLICT (category) DO NOTHING;

-- Update the comment to include the new category
COMMENT ON COLUMN living_summaries.category IS 'One of: personality, goals, relationships, projects, interests, wellbeing, commitments, significant_dates';
