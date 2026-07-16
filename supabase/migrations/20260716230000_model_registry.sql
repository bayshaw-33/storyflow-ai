-- Sub-project 12: Model Registration and Capability Config
-- Creates a per-user registry of AI models (image/video/text) with capabilities

CREATE TABLE IF NOT EXISTS public.storyflow_model_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    team_id uuid,
    name text NOT NULL,
    provider text NOT NULL,
    modality text NOT NULL,
    model_id text NOT NULL,
    capabilities jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storyflow_model_registry_modality_check CHECK (modality = ANY (ARRAY['image'::text, 'video'::text, 'text'::text])),
    CONSTRAINT storyflow_model_registry_status_check CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]))
);

CREATE INDEX IF NOT EXISTS idx_model_registry_user ON public.storyflow_model_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_model_registry_default ON public.storyflow_model_registry(user_id, modality, is_default);

ALTER TABLE public.storyflow_model_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own model registry" ON public.storyflow_model_registry
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.storyflow_model_registry TO authenticated;
