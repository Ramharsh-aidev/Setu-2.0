/**
 * ============================================
 * VAPI WEBHOOK HANDLER ROUTES
 * ============================================
 * Handles incoming webhooks from Vapi service
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Import services
const { searchSchemes, upsertContext } = require('../lib/qdrant');
const { extractEntities, generateResponse, checkEligibility } = require('../lib/huggingface');
const databaseService = require('../lib/database');
const {
  createSession, getSession, updateSession, addConversationTurn, getConversationHistory, addRecommendation,
} = databaseService;

// ============================================
// UTILITY: Generate embedding for context storage
// ============================================
const generateEmbedding = async (text) => {
  try {
    const { HfInference } = require('@huggingface/inference');
    const hf = new HfInference(process.env.HF_API_TOKEN);
    const response = await hf.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      inputs: text,
    });
    return response;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    return null;
  }
};

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

/**
 * Main webhook endpoint for Vapi messages
 * POST /api/vapi/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    const { sessionId, message, phoneNumber, language = 'en' } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, message',
        statusCode: 400,
      });
    }

    console.log(`\n📞 Incoming Message from Vapi`);
    console.log(`   Session: ${sessionId}`);
    console.log(`   Message: ${message}`);
    console.log(`   Language: ${language}\n`);

    // Get or create session
    let session = await getSession(sessionId);
    if (!session) {
      console.log(`✨ Creating new session: ${sessionId}`);
      session = await createSession({
        session_id: sessionId,
        phone_number: phoneNumber,
        language: language,
      });
    }

    // Extract entities from user message
    console.log('🔍 Extracting entities...');
    const userContext = await extractEntities(message);
    console.log('   Extracted:', userContext);

    // Update session with new entities
    if (Object.keys(userContext).length > 0) {
      const existingEntities = session.extracted_entities || {};
      const mergedEntities = { ...existingEntities, ...userContext };
      await updateSession(sessionId, { extracted_entities: mergedEntities });
    }

    // Add user message to conversation history
    const turnNumber = (session.conversation_turns || 0) + 1;
    await addConversationTurn(sessionId, turnNumber, 'user', message, userContext);

    // Generate embedding for context storage
    console.log('🔗 Generating context embedding...');
    const contextEmbedding = await generateEmbedding(message);

    if (contextEmbedding) {
      const contextId = `${sessionId}-${turnNumber}`;
      await upsertContext(contextId, contextEmbedding, {
        session_id: sessionId,
        turn_number: turnNumber,
        role: 'user',
        extracted_entities: userContext,
      });
    }

    // Search for relevant schemes
    console.log('📚 Searching for relevant schemes...');
    const messageEmbedding = await generateEmbedding(message);
    const relevantSchemes = messageEmbedding
      ? await searchSchemes(messageEmbedding, 10)
      : [];

    console.log(`   Found ${relevantSchemes.length} relevant schemes`);

    // Get user context
    let fullUserContext = session.extracted_entities || {};

    // Check eligibility for relevant schemes
    console.log('✅ Checking eligibility...');
    const eligibleSchemes = [];
    const eligibilityMap = {};

    for (const scheme of relevantSchemes) {
      const eligibilityResult = await checkEligibility(scheme, fullUserContext);
      eligibilityMap[scheme.payload.scheme_name] = {
        eligible: eligibilityResult.eligible,
        reasons: eligibilityResult.reasons,
        missingInfo: eligibilityResult.missingInfo,
      };

      if (eligibilityResult.eligible) {
        eligibleSchemes.push(scheme);
      }
    }

    // Generate AI response
    console.log('🤖 Generating response...');
    const aiResponse = await generateResponse(
      message,
      eligibleSchemes.slice(0, 3), // Top 3
      fullUserContext,
      language
    );

    console.log(`   Response: ${aiResponse.substring(0, 100)}...`);

    // Add AI response to conversation history
    await addConversationTurn(sessionId, turnNumber + 1, 'assistant', aiResponse, {});

    // Store recommendation
    const recommendedSchemeIds = eligibleSchemes
      .slice(0, 5)
      .map(s => s.payload.scheme_slug);
    await addRecommendation(sessionId, recommendedSchemeIds, eligibilityMap);

    // Update session
    await updateSession(sessionId, {
      conversation_turns: turnNumber + 1,
      recommended_schemes: recommendedSchemeIds,
    });

    // Prepare response for Vapi
    const response_data = {
      statusCode: 200,
      response: {
        message: aiResponse,
        eligibleSchemes: eligibleSchemes
          .slice(0, 3)
          .map(s => ({
            name: s.payload.scheme_name,
            description: s.payload.description_short,
            url: s.payload.url,
          })),
        sessionMetadata: {
          sessionId,
          turnNumber: turnNumber + 1,
          extractedEntities: fullUserContext,
        },
      },
    };

    console.log('✅ Response sent to Vapi\n');

    res.json(response_data);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Initiate a new conversation
 * POST /api/vapi/session/start
 */
router.post('/session/start', async (req, res) => {
  try {
    const { phoneNumber, language = 'en', userId = null } = req.body;

    const sessionId = uuidv4();

    const session = await createSession({
      session_id: sessionId,
      phone_number: phoneNumber,
      language: language,
      user_id: userId,
    });

    console.log(`✨ Started new session: ${sessionId}`);

    res.json({
      statusCode: 200,
      sessionId: sessionId,
      message: 'Session started successfully',
      session: session,
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * End a conversation
 * POST /api/vapi/session/end
 */
router.post('/session/end', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing sessionId',
        statusCode: 400,
      });
    }

    const session = await updateSession(sessionId, {
      status: 'closed',
    });

    console.log(`🏁 Closed session: ${sessionId}`);

    res.json({
      statusCode: 200,
      message: 'Session ended successfully',
      session: session,
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get session details
 * GET /api/vapi/session/:sessionId
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { includeHistory = false } = req.query;

    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        statusCode: 404,
      });
    }

    let conversationHistory = [];
    if (includeHistory === 'true') {
      conversationHistory = await getConversationHistory(sessionId);
    }

    res.json({
      statusCode: 200,
      session: session,
      conversationHistory: conversationHistory,
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

module.exports = router;
