-- Card Drawing System
-- Tracks draw history for the card drawing (抽卡) feature
-- Draws from art assets and universe entities

CREATE TABLE IF NOT EXISTS public.storyflow_card_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT,
  
  -- Draw configuration
  draw_type TEXT NOT NULL DEFAULT 'mixed'
    CHECK (draw_type IN ('character', 'scene', 'prop', 'mixed')),
  pool_count INTEGER NOT NULL DEFAULT 0,
  drawn_count INTEGER NOT NULL DEFAULT 1,
  
  -- Draw results (array of card summaries)
  drawn_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Optional session label
  label TEXT DEFAULT '',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_card_draws_owner ON public.storyflow_card_draws(owner_id);
CREATE INDEX IF NOT EXISTS idx_card_draws_owner_created ON public.storyflow_card_draws(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_draws_project ON public.storyflow_card_draws(project_id) WHERE project_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.storyflow_card_draws ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY card_draws_owner_select ON public.storyflow_card_draws
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY card_draws_owner_insert ON public.storyflow_card_draws
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY card_draws_owner_delete ON public.storyflow_card_draws
  FOR DELETE USING (owner_id = auth.uid());
