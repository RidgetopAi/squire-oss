-- Squire Goals - Persistent intention system for autonomous agent
-- Enables Squire to maintain its own priorities between sessions

CREATE TABLE IF NOT EXISTS squire_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('curiosity', 'improvement', 'experiment', 'preparation')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  notes JSONB DEFAULT '[]'::jsonb,  -- running thoughts/progress log
  outcome TEXT,  -- what happened when completed
  last_worked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active goals sorted by priority
CREATE INDEX IF NOT EXISTS idx_squire_goals_active ON squire_goals(status, priority) WHERE status = 'active';

-- Index for goal type filtering
CREATE INDEX IF NOT EXISTS idx_squire_goals_type ON squire_goals(goal_type);
