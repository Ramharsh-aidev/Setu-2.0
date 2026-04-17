-- ============================================
-- SETU DATABASE INITIALIZATION
-- ============================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- SESSIONS TABLE (For Vapi conversations)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255),
  phone_number VARCHAR(20),
  language VARCHAR(10) DEFAULT 'en',
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  extracted_entities JSONB DEFAULT '{}',
  recommended_schemes JSONB DEFAULT '[]',
  conversation_turns INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CONVERSATION HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  turn_number INT NOT NULL,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  extracted_entities JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SCHEMES METADATA TABLE (For deduplication)
-- ============================================
CREATE TABLE IF NOT EXISTS schemes_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scheme_name VARCHAR(255) NOT NULL UNIQUE,
  scheme_slug VARCHAR(255) UNIQUE,
  content_hash VARCHAR(64),
  last_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  embedded_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- RECOMMENDATIONS HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recommendations_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  recommended_scheme_ids JSONB DEFAULT '[]',
  eligibility_status JSONB DEFAULT '{}',
  confidence_scores JSONB DEFAULT '{}',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversation_history(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversation_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_schemes_metadata_scheme_slug ON schemes_metadata(scheme_slug);
CREATE INDEX IF NOT EXISTS idx_schemes_metadata_content_hash ON schemes_metadata(content_hash);
CREATE INDEX IF NOT EXISTS idx_recommendations_session_id ON recommendations_history(session_id);
