-- Create the main storage table
CREATE TABLE user_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  type_name TEXT NOT NULL,
  data JSONB NOT NULL,
  
  -- Generated columns for common security patterns
  public_read BOOLEAN GENERATED ALWAYS AS 
    (COALESCE((data->>'publicRead')::boolean, false)) STORED,
  public_update BOOLEAN GENERATED ALWAYS AS 
    (COALESCE((data->>'publicUpdate')::boolean, false)) STORED,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- Core RLS Policies
-- 1. Users can always read their own data
CREATE POLICY "Users read own data" ON user_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Public read policy
CREATE POLICY "Public read access" ON user_data
  FOR SELECT
  USING (public_read = true);

-- 3. Users can insert their own data
CREATE POLICY "Users insert own data" ON user_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. Users can update their own data
CREATE POLICY "Users update own data" ON user_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Public update policy (still requires auth, but any authenticated user)
CREATE POLICY "Public update access" ON user_data
  FOR UPDATE
  USING (public_update = true AND auth.uid() IS NOT NULL)
  WITH CHECK (public_update = true AND auth.uid() IS NOT NULL);

-- 6. Users can delete their own data
CREATE POLICY "Users delete own data" ON user_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- Core Indexes
-- Index for user's own data queries (most common)
CREATE INDEX idx_user_type ON user_data(user_id, type_name);

-- Index for public data queries
CREATE INDEX idx_public_read ON user_data(type_name, public_read) 
  WHERE public_read = true;

-- Index for type queries (for migrations, admin views, etc)
CREATE INDEX idx_type ON user_data(type_name);

-- Index for updated_at (useful for sync, recent changes)
CREATE INDEX idx_updated ON user_data(updated_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_data_updated_at
  BEFORE UPDATE ON user_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Example: Adding indexes for specific types later
-- These would be added as your app grows and you identify slow queries

-- For a 'projects' type with searchable title
-- CREATE INDEX idx_projects_title ON user_data((data->>'title')) 
--   WHERE type_name = 'projects';

-- For full-text search on projects
-- CREATE INDEX idx_projects_search ON user_data
--   USING gin(to_tsvector('english', 
--     COALESCE(data->>'title', '') || ' ' || 
--     COALESCE(data->>'description', '')))
--   WHERE type_name = 'projects';

-- For sortable fields
-- CREATE INDEX idx_projects_priority ON user_data((data->'priority')::int)
--   WHERE type_name = 'projects' AND data->'priority' IS NOT NULL;