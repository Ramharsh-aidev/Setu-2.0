/**
 * ============================================
 * SESSIONS API ROUTES
 * ============================================
 * Handles session management and conversation history
 */

const express = require('express');
const router = express.Router();

// Import services
const {
  getSession,
  getConversationHistory,
  getRecommendationHistory,
  getDatabaseStats,
} = require('../lib/database');

// ============================================
// ROUTES
// ============================================

/**
 * Get session details
 * GET /api/sessions/:sessionId
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { includeHistory = false, includeRecommendations = false } = req.query;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        statusCode: 404,
      });
    }

    const response = {
      statusCode: 200,
      session: {
        id: session.id,
        session_id: session.session_id,
        user_id: session.user_id,
        phone_number: session.phone_number,
        language: session.language,
        status: session.status,
        start_time: session.start_time,
        end_time: session.end_time,
        conversation_turns: session.conversation_turns,
        extracted_entities: session.extracted_entities,
        recommended_schemes: session.recommended_schemes,
        created_at: session.created_at,
        updated_at: session.updated_at,
      },
    };

    // Include conversation history if requested
    if (includeHistory === 'true') {
      const conversationHistory = await getConversationHistory(sessionId);
      response.conversation_history = conversationHistory;
    }

    // Include recommendations history if requested
    if (includeRecommendations === 'true') {
      const recommendationHistory = await getRecommendationHistory(sessionId);
      response.recommendation_history = recommendationHistory;
    }

    res.json(response);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get conversation history for a session
 * GET /api/sessions/:sessionId/history
 */
router.get('/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        statusCode: 404,
      });
    }

    const conversationHistory = await getConversationHistory(sessionId, parseInt(limit));

    res.json({
      statusCode: 200,
      sessionId: sessionId,
      turn_count: conversationHistory.length,
      conversation_history: conversationHistory,
    });
  } catch (error) {
    console.error('Error getting conversation history:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get scheme recommendations for a session
 * GET /api/sessions/:sessionId/recommendations
 */
router.get('/:sessionId/recommendations', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 10 } = req.query;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        statusCode: 404,
      });
    }

    const recommendations = await getRecommendationHistory(sessionId, parseInt(limit));

    res.json({
      statusCode: 200,
      sessionId: sessionId,
      recommendation_count: recommendations.length,
      latest_recommendations:
        recommendations.length > 0
          ? {
              schemes: recommendations[0].recommended_scheme_ids,
              eligibility_status: recommendations[0].eligibility_status,
              confidence_scores: recommendations[0].confidence_scores,
              timestamp: recommendations[0].timestamp,
            }
          : null,
      all_recommendations: recommendations,
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get extracted entities for a session
 * GET /api/sessions/:sessionId/entities
 */
router.get('/:sessionId/entities', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        statusCode: 404,
      });
    }

    res.json({
      statusCode: 200,
      sessionId: sessionId,
      extracted_entities: session.extracted_entities || {},
      conversation_turns: session.conversation_turns,
    });
  } catch (error) {
    console.error('Error getting entities:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get database statistics
 * GET /api/sessions/stats/database
 */
router.get('/stats/database', async (req, res) => {
  try {
    const stats = await getDatabaseStats();

    if (!stats) {
      return res.status(500).json({
        error: 'Failed to retrieve statistics',
        statusCode: 500,
      });
    }

    res.json({
      statusCode: 200,
      stats: {
        total_sessions: stats.sessions,
        total_conversations: stats.conversations,
        total_schemes: stats.schemes,
      },
    });
  } catch (error) {
    console.error('Error getting database stats:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

module.exports = router;
