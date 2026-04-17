/**
 * ============================================
 * QDRANT VECTOR DATABASE SERVICE
 * ============================================
 * Handles all vector operations for schemes and context memory
 */

const QdrantClient = require('qdrant-client');

let client;

const COLLECTION_SCHEMES = process.env.QDRANT_COLLECTION_SCHEMES || 'schemes_knowledge_base';
const COLLECTION_CONTEXT = process.env.QDRANT_COLLECTION_CONTEXT || 'user_context_memory';

// ============================================
// INITIALIZE QDRANT CLIENT
// ============================================
const initializeQdrant = async () => {
  try {
    client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY || '',
    });

    // Health check
    await client.healthCheck();
    console.log('✅ Connected to Qdrant');

    // Create collections if they don't exist
    await createCollections();
  } catch (error) {
    console.error('❌ Failed to connect to Qdrant:', error.message);
    throw error;
  }
};

// ============================================
// CREATE COLLECTIONS
// ============================================
const createCollections = async () => {
  try {
    // Check if schemes collection exists
    try {
      await client.getCollection(COLLECTION_SCHEMES);
    } catch (e) {
      console.log(`Creating collection: ${COLLECTION_SCHEMES} + error: ${e.message}`);
      await client.createCollection(COLLECTION_SCHEMES, {
        vectors: {
          size: 384, // Hugging Face sentence-transformers default
          distance: 'Cosine',
        },
      });
    }

    // Check if context collection exists
    try {
      await client.getCollection(COLLECTION_CONTEXT);
    } catch (e) {
      console.log(`Creating collection: ${COLLECTION_CONTEXT} + error: ${e.message}`);
      await client.createCollection(COLLECTION_CONTEXT, {
        vectors: {
          size: 384,
          distance: 'Cosine',
        },
      });
    }

    console.log('✅ Collections ready');
  } catch (error) {
    console.error('❌ Error creating collections:', error.message);
    throw error;
  }
};

// ============================================
// VECTOR OPERATIONS
// ============================================

/**
 * Search for relevant schemes based on user query
 * @param {number[]} queryVector - The query vector
 * @param {number} limit - Number of results to return
 * @param {Object} filters - Optional filters for hard constraints
 * @returns {Promise<Object[]>}
 */
const searchSchemes = async (queryVector, limit = 10, filters = null) => {
  try {
    const searchParams = {
      vector: queryVector,
      limit: limit,
    };

    if (filters) {
      searchParams.query_filter = filters;
    }

    const results = await client.search(COLLECTION_SCHEMES, searchParams);
    return results;
  } catch (error) {
    console.error('Error searching schemes:', error.message);
    return [];
  }
};

/**
 * Search for user context/conversation history
 * @param {number[]} queryVector - The query vector
 * @param {string} sessionId - Session ID for filtering
 * @param {number} limit - Number of results to return
 * @returns {Promise<Object[]>}
 */
const searchUserContext = async (queryVector, sessionId, limit = 5) => {
  try {
    const filters = {
      must: [
        {
          key: 'session_id',
          match: { value: sessionId },
        },
      ],
    };

    const results = await client.search(COLLECTION_CONTEXT, {
      vector: queryVector,
      limit: limit,
      query_filter: filters,
    });

    return results;
  } catch (error) {
    console.error('Error searching user context:', error.message);
    return [];
  }
};

/**
 * Upsert a scheme into the vector database
 * @param {string} schemeId - Unique ID for the scheme
 * @param {number[]} vector - The scheme vector
 * @param {Object} payload - Scheme metadata and details
 * @returns {Promise<void>}
 */
const upsertScheme = async (schemeId, vector, payload) => {
  try {
    await client.upsert(COLLECTION_SCHEMES, {
      points: [
        {
          id: schemeId,
          vector: vector,
          payload: payload,
        },
      ],
    });
  } catch (error) {
    console.error('Error upserting scheme:', error.message);
    throw error;
  }
};

/**
 * Upsert multiple schemes (batch operation)
 * @param {Array} points - Array of {id, vector, payload}
 * @returns {Promise<void>}
 */
const upsertSchemeBatch = async (points) => {
  try {
    // Batch in chunks of 100 to avoid overload
    const chunkSize = 100;
    for (let i = 0; i < points.length; i += chunkSize) {
      const chunk = points.slice(i, i + chunkSize);
      await client.upsert(COLLECTION_SCHEMES, { points: chunk });
    }
  } catch (error) {
    console.error('Error batch upserting schemes:', error.message);
    throw error;
  }
};

/**
 * Upsert a conversation turn to context memory
 * @param {string} contextId - Unique ID for this context entry
 * @param {number[]} vector - The context vector
 * @param {Object} payload - Context metadata (session_id, extracted_entities, etc.)
 * @returns {Promise<void>}
 */
const upsertContext = async (contextId, vector, payload) => {
  try {
    await client.upsert(COLLECTION_CONTEXT, {
      points: [
        {
          id: contextId,
          vector: vector,
          payload: payload,
        },
      ],
    });
  } catch (error) {
    console.error('Error upserting context:', error.message);
    throw error;
  }
};

/**
 * Delete a scheme from the database
 * @param {string} schemeId - ID of the scheme to delete
 * @returns {Promise<void>}
 */
const deleteScheme = async (schemeId) => {
  try {
    await client.delete(COLLECTION_SCHEMES, {
      points_selector: {
        points: [schemeId],
      },
    });
  } catch (error) {
    console.error('Error deleting scheme:', error.message);
    throw error;
  }
};

/**
 * Get collection statistics
 * @returns {Promise<Object>}
 */
const getCollectionStats = async () => {
  try {
    const schemesStats = await client.getCollection(COLLECTION_SCHEMES);
    const contextStats = await client.getCollection(COLLECTION_CONTEXT);

    return {
      schemes: {
        name: COLLECTION_SCHEMES,
        points_count: schemesStats.points_count,
        vectors_count: schemesStats.vectors_count,
      },
      context: {
        name: COLLECTION_CONTEXT,
        points_count: contextStats.points_count,
        vectors_count: contextStats.vectors_count,
      },
    };
  } catch (error) {
    console.error('Error getting collection stats:', error.message);
    return null;
  }
};

/**
 * Clear all data from collections (use with caution!)
 * @returns {Promise<void>}
 */
const clearCollections = async () => {
  try {
    await client.deleteCollection(COLLECTION_SCHEMES);
    await client.deleteCollection(COLLECTION_CONTEXT);
    await createCollections();
    console.log('Collections cleared and recreated');
  } catch (error) {
    console.error('Error clearing collections:', error.message);
    throw error;
  }
};

module.exports = {
  initializeQdrant,
  searchSchemes,
  searchUserContext,
  upsertScheme,
  upsertSchemeBatch,
  upsertContext,
  deleteScheme,
  getCollectionStats,
  clearCollections,
};
