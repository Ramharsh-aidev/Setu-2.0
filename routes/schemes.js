/**
 * ============================================
 * SCHEMES API ROUTES
 * ============================================
 * Handles scheme queries and searching
 */

const express = require('express');
const router = express.Router();

// Import services
const { searchSchemes, getCollectionStats } = require('../lib/qdrant');
const { HfInference } = require('@huggingface/inference');

// ============================================
// UTILITY: Generate embedding
// ============================================
const generateEmbedding = async (text) => {
  try {
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
// ROUTES
// ============================================

/**
 * Search schemes by query
 * POST /api/schemes/search
 * Body: { query: string, limit?: number, filters?: object }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 10, filters = null } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        statusCode: 400,
      });
    }

    console.log(`🔍 Searching schemes for: "${query}"`);

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      return res.status(500).json({
        error: 'Failed to generate query embedding',
        statusCode: 500,
      });
    }

    // Search Qdrant
    const results = await searchSchemes(queryEmbedding, Math.min(limit, 50), filters);

    console.log(`✅ Found ${results.length} schemes`);

    // Format results
    const formattedResults = results.map(item => ({
      id: item.id,
      scheme_name: item.payload.scheme_name,
      slug: item.payload.scheme_slug,
      description: item.payload.description_short,
      ministry: item.payload.ministry,
      category: item.payload.category,
      tags: item.payload.tags,
      url: item.payload.url,
      eligibility: item.payload.hard_filters,
      score: item.score,
    }));

    res.json({
      statusCode: 200,
      query: query,
      count: formattedResults.length,
      schemes: formattedResults,
    });
  } catch (error) {
    console.error('Error searching schemes:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get all schemes (paginated)
 * GET /api/schemes/list?limit=20&offset=0
 */
router.get('/list', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    // Since Qdrant is vector-based, we can search with a dummy query to get all
    // Or we can return from database. For now, we'll suggest a simpler approach.

    res.json({
      statusCode: 200,
      message: 'Use /search endpoint for scheme discovery',
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Error listing schemes:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get scheme details by slug
 * GET /api/schemes/:slug
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        error: 'Missing slug parameter',
        statusCode: 400,
      });
    }

    // Search for scheme by slug
    const queryEmbedding = await generateEmbedding(slug);
    const results = await searchSchemes(queryEmbedding, 50);

    const scheme = results.find(s => s.payload.scheme_slug === slug);

    if (!scheme) {
      return res.status(404).json({
        error: 'Scheme not found',
        statusCode: 404,
      });
    }

    res.json({
      statusCode: 200,
      scheme: {
        id: scheme.id,
        name: scheme.payload.scheme_name,
        slug: scheme.payload.scheme_slug,
        description: scheme.payload.description_short,
        ministry: scheme.payload.ministry,
        category: scheme.payload.category,
        tags: scheme.payload.tags,
        url: scheme.payload.url,
        eligibility: scheme.payload.hard_filters,
        required_documents: scheme.payload.required_documents,
        level: scheme.payload.level,
      },
    });
  } catch (error) {
    console.error('Error getting scheme:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Search schemes by criteria (income, occupation, location)
 * POST /api/schemes/filter
 * Body: { income?: number, occupation?: string, location?: string, state?: string }
 */
router.post('/filter', async (req, res) => {
  try {
    const { income, occupation, location, state } = req.body;

    // Build query
    const queryParts = [];
    if (occupation) queryParts.push(`occupation: ${occupation}`);
    if (income) queryParts.push(`income below ${income}`);
    if (location || state) queryParts.push(`available in ${location || state}`);

    const query = queryParts.join(' ') || 'government schemes';

    console.log(`🔍 Filtering schemes with: ${query}`);

    // Generate embedding and search
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      return res.status(500).json({
        error: 'Failed to generate query embedding',
        statusCode: 500,
      });
    }

    const results = await searchSchemes(queryEmbedding, 50);

    // Apply hard filters
    const filtered = results.filter(scheme => {
      const filters = scheme.payload.hard_filters || {};

      if (income && filters.max_income && income > filters.max_income) {
        return false;
      }

      if (occupation && filters.target_occupation?.length > 0) {
        if (!filters.target_occupation.includes(occupation.toLowerCase())) {
          return false;
        }
      }

      if ((location || state) && filters.target_state?.length > 0) {
        const states = filters.target_state.map(s => s.toLowerCase());
        if (!states.includes('all')) {
          if (!states.includes((location || state).toLowerCase())) {
            return false;
          }
        }
      }

      return true;
    });

    console.log(`✅ Filtered to ${filtered.length} schemes`);

    const formattedResults = filtered.map(item => ({
      name: item.payload.scheme_name,
      slug: item.payload.scheme_slug,
      description: item.payload.description_short,
      ministry: item.payload.ministry,
      url: item.payload.url,
      eligibility: item.payload.hard_filters,
      match_score: item.score,
    }));

    res.json({
      statusCode: 200,
      query: { income, occupation, location, state },
      count: formattedResults.length,
      schemes: formattedResults,
    });
  } catch (error) {
    console.error('Error filtering schemes:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

/**
 * Get statistics about schemes collection
 * GET /api/schemes/stats
 */
router.get('/stats/collection', async (req, res) => {
  try {
    const stats = await getCollectionStats();

    res.json({
      statusCode: 200,
      stats: stats,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: error.message,
      statusCode: 500,
    });
  }
});

module.exports = router;
