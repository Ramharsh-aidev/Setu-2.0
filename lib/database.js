/**
 * ============================================
 * PostgreSQL DATABASE SERVICE
 * ============================================
 * Handles all database operations for sessions, conversations, and metadata
 */

const { Pool } = require('pg');

let pool;

const initializeDatabase = async () => {
  try {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'setu_user',
      password: process.env.DB_PASSWORD || 'setu_password',
      database: process.env.DB_NAME || 'setu_db',
    });

    // Test the connection
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL:', result.rows[0]);
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error.message);
    throw error;
  }
};

// ============================================
// SESSION OPERATIONS
// ============================================

/**
 * Create a new session
 * @param {Object} sessionData - {session_id, user_id, phone_number, language}
 * @returns {Promise<Object>}
 */
const createSession = async (sessionData) => {
  try {
    const query = `
      INSERT INTO sessions (session_id, user_id, phone_number, language)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await pool.query(query, [
      sessionData.session_id,
      sessionData.user_id || null,
      sessionData.phone_number || null,
      sessionData.language || 'en',
    ]);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating session:', error.message);
    throw error;
  }
};

/**
 * Get session by session_id
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
const getSession = async (sessionId) => {
  try {
    const query = `SELECT * FROM sessions WHERE session_id = $1`;
    const result = await pool.query(query, [sessionId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting session:', error.message);
    return null;
  }
};

/**
 * Update session metadata
 * @param {string} sessionId
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>}
 */
const updateSession = async (sessionId, updates) => {
  try {
    const allowedFields = ['extracted_entities', 'recommended_schemes', 'conversation_turns', 'status'];
    const setClause = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount}`);
        values.push(key === 'extracted_entities' || key === 'recommended_schemes' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClause.length === 0) return null;

    values.push(sessionId);
    const query = `UPDATE sessions SET ${setClause.join(', ')}, updated_at = NOW() WHERE session_id = $${paramCount} RETURNING *;`;
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error updating session:', error.message);
    throw error;
  }
};

/**
 * Close a session
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
const closeSession = async (sessionId) => {
  try {
    const query = `
      UPDATE sessions 
      SET status = 'closed', end_time = NOW()
      WHERE session_id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [sessionId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error closing session:', error.message);
    throw error;
  }
};

// ============================================
// CONVERSATION HISTORY OPERATIONS
// ============================================

/**
 * Add a conversation turn
 * @param {string} sessionId
 * @param {number} turnNumber
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content
 * @param {Object} extractedEntities
 * @returns {Promise<Object>}
 */
const addConversationTurn = async (sessionId, turnNumber, role, content, extractedEntities = {}) => {
  try {
    const query = `
      INSERT INTO conversation_history (session_id, turn_number, role, content, extracted_entities)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await pool.query(query, [
      sessionId,
      turnNumber,
      role,
      content,
      JSON.stringify(extractedEntities),
    ]);
    return result.rows[0];
  } catch (error) {
    console.error('Error adding conversation turn:', error.message);
    throw error;
  }
};

/**
 * Get conversation history for a session
 * @param {string} sessionId
 * @param {number} limit - Optional limit on number of results
 * @returns {Promise<Array>}
 */
const getConversationHistory = async (sessionId, limit = 50) => {
  try {
    const query = `
      SELECT * FROM conversation_history 
      WHERE session_id = $1
      ORDER BY turn_number ASC
      LIMIT $2;
    `;
    const result = await pool.query(query, [sessionId, limit]);
    return result.rows;
  } catch (error) {
    console.error('Error getting conversation history:', error.message);
    return [];
  }
};

// ============================================
// SCHEMES METADATA OPERATIONS
// ============================================

/**
 * Check if scheme exists and get its content hash
 * @param {string} schemeSlug
 * @returns {Promise<Object|null>}
 */
const getSchemeMetadata = async (schemeSlug) => {
  try {
    const query = `SELECT * FROM schemes_metadata WHERE scheme_slug = $1`;
    const result = await pool.query(query, [schemeSlug]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting scheme metadata:', error.message);
    return null;
  }
};

/**
 * Upsert scheme metadata
 * @param {string} schemeName
 * @param {string} schemeSlug
 * @param {string} contentHash
 * @returns {Promise<Object>}
 */
const upsertSchemeMetadata = async (schemeName, schemeSlug, contentHash) => {
  try {
    const query = `
      INSERT INTO schemes_metadata (scheme_name, scheme_slug, content_hash, embedded_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (scheme_slug)
      DO UPDATE SET 
        content_hash = EXCLUDED.content_hash,
        last_scraped = NOW(),
        embedded_at = NOW()
      RETURNING *;
    `;
    const result = await pool.query(query, [schemeName, schemeSlug, contentHash]);
    return result.rows[0];
  } catch (error) {
    console.error('Error upserting scheme metadata:', error.message);
    throw error;
  }
};

// ============================================
// RECOMMENDATIONS OPERATIONS
// ============================================

/**
 * Add recommendation to history
 * @param {string} sessionId
 * @param {Array} recommendedSchemeIds
 * @param {Object} eligibilityStatus
 * @param {Object} confidenceScores
 * @returns {Promise<Object>}
 */
const addRecommendation = async (sessionId, recommendedSchemeIds, eligibilityStatus = {}, confidenceScores = {}) => {
  try {
    const query = `
      INSERT INTO recommendations_history (session_id, recommended_scheme_ids, eligibility_status, confidence_scores)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await pool.query(query, [
      sessionId,
      JSON.stringify(recommendedSchemeIds),
      JSON.stringify(eligibilityStatus),
      JSON.stringify(confidenceScores),
    ]);
    return result.rows[0];
  } catch (error) {
    console.error('Error adding recommendation:', error.message);
    throw error;
  }
};

/**
 * Get recommendation history for a session
 * @param {string} sessionId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getRecommendationHistory = async (sessionId, limit = 10) => {
  try {
    const query = `
      SELECT * FROM recommendations_history
      WHERE session_id = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `;
    const result = await pool.query(query, [sessionId, limit]);
    return result.rows;
  } catch (error) {
    console.error('Error getting recommendation history:', error.message);
    return [];
  }
};

// ============================================
// DATABASE HEALTH & UTILITIES
// ============================================

/**
 * Get database statistics
 * @returns {Promise<Object>}
 */
const getDatabaseStats = async () => {
  try {
    const sessionCount = await pool.query('SELECT COUNT(*) FROM sessions');
    const conversationCount = await pool.query('SELECT COUNT(*) FROM conversation_history');
    const schemesCount = await pool.query('SELECT COUNT(*) FROM schemes_metadata');

    return {
      sessions: parseInt(sessionCount.rows[0].count),
      conversations: parseInt(conversationCount.rows[0].count),
      schemes: parseInt(schemesCount.rows[0].count),
    };
  } catch (error) {
    console.error('Error getting database stats:', error.message);
    return null;
  }
};

/**
 * Close database connection
 * @returns {Promise<void>}
 */
const closeDatabase = async () => {
  try {
    if (pool) {
      await pool.end();
      console.log('Database connection closed');
    }
  } catch (error) {
    console.error('Error closing database:', error.message);
  }
};

module.exports = {
  initializeDatabase,
  // Sessions
  createSession,
  getSession,
  updateSession,
  closeSession,
  // Conversations
  addConversationTurn,
  getConversationHistory,
  // Schemes Metadata
  getSchemeMetadata,
  upsertSchemeMetadata,
  // Recommendations
  addRecommendation,
  getRecommendationHistory,
  // Utilities
  getDatabaseStats,
  closeDatabase,
};
