/**
 * ============================================
 * PERIODIC SCRAPER SERVICE
 * ============================================
 * Handles daily scraping of schemes data and updating Qdrant with embeddings
 */

const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
const { schedule } = require('node-cron');
const { HfInference } = require('@huggingface/inference');

// Import services
const { getSchemeMetadata, upsertSchemeMetadata } = require('./database');
const { upsertSchemeBatch } = require('./qdrant');

let hfClient;

const initializeScraper = () => {
  hfClient = new HfInference(process.env.HF_API_TOKEN);
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate SHA256 hash of content
 * @param {string} content
 * @returns {string}
 */
const generateContentHash = (content) => {
  return createHash('sha256').update(content).digest('hex');
};

/**
 * Generate embedding for scheme text using Hugging Face
 * @param {string} text
 * @returns {Promise<number[]>}
 */
const generateEmbedding = async (text) => {
  try {
    const response = await hfClient.featureExtraction({
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      inputs: text,
    });
    return response;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    return null;
  }
};

/**
 * Prepare scheme text for embedding
 * @param {Object} scheme
 * @returns {string}
 */
const prepareSchemeText = (scheme) => {
  const parts = [
    scheme.scheme_name || '',
    scheme.brief_description || '',
    scheme.description || '',
    (scheme.category || []).join(' '),
    (scheme.tags || []).join(' '),
  ];
  return parts.filter(p => p).join(' ');
};

/**
 * Calculate content hash from scheme data
 * @param {Object} scheme
 * @returns {string}
 */
const calculateSchemeHash = (scheme) => {
  const contentToHash = JSON.stringify({
    scheme_name: scheme.scheme_name,
    brief_description: scheme.brief_description,
    description: scheme.description,
    category: scheme.category,
    tags: scheme.tags,
    eligibility: scheme.eligibility,
  });
  return generateContentHash(contentToHash);
};

// ============================================
// MAIN SCRAPER LOGIC
// ============================================

/**
 * Load schemes from local JSON files
 * @returns {Promise<Array>}
 */
const loadSchemesFromFiles = async () => {
  try {
    console.log('📂 Loading schemes from data files...');

    let allSchemes = [];

    // Try to load from schemes_details.json (most detailed)
    const detailsPath = join(process.cwd(), 'data', 'schemes_details.json');
    if (existsSync(detailsPath)) {
      try {
        const detailsData = JSON.parse(readFileSync(detailsPath, 'utf-8'));
        if (Array.isArray(detailsData)) {
          allSchemes = detailsData;
          console.log(`✅ Loaded ${allSchemes.length} schemes from schemes_details.json`);
        }
      } catch {
        console.warn('Warning: Could not parse schemes_details.json');
      }
    }

    // Fallback to schemes_list.json if no details
    if (allSchemes.length === 0) {
      const listPath = join(process.cwd(), 'data', 'schemes_list.json');
      if (existsSync(listPath)) {
        const listData = JSON.parse(readFileSync(listPath, 'utf-8'));
        if (Array.isArray(listData)) {
          allSchemes = listData;
          console.log(`✅ Loaded ${allSchemes.length} schemes from schemes_list.json`);
        }
      }
    }

    return allSchemes;
  } catch (error) {
    console.error('Error loading schemes from files:', error.message);
    return [];
  }
};

/**
 * Process and embed schemes
 * This is the core scraping logic with deduplication
 * @returns {Promise<Object>} {processed: number, updated: number, skipped: number}
 */
const processAndEmbedSchemes = async () => {
  try {
    const schemes = await loadSchemesFromFiles();
    if (schemes.length === 0) {
      console.log('⚠️ No schemes found to process');
      return { processed: 0, updated: 0, skipped: 0 };
    }

    console.log(`\n🔄 Processing ${schemes.length} schemes...\n`);

    const pointsToUpsert = [];
    let processed = 0;
    let updated = 0;
    let skipped = 0;

    for (const scheme of schemes) {
      try {
        const schemeSlug = scheme.slug || scheme.scheme_name?.toLowerCase().replace(/\s+/g, '-');
        if (!schemeSlug) {
          console.warn('⚠️ Skipping scheme with no slug:', scheme.scheme_name);
          skipped++;
          continue;
        }

        // Calculate content hash
        const newHash = calculateSchemeHash(scheme);

        // Check existing metadata
        const existingMetadata = await getSchemeMetadata(schemeSlug);

        // Deduplication: Skip if hash matches
        if (existingMetadata && existingMetadata.content_hash === newHash) {
          console.log(`✓ Skipped (unchanged): ${scheme.scheme_name}`);
          skipped++;
          continue;
        }

        // Generate embedding
        const schemeText = prepareSchemeText(scheme);
        const embedding = await generateEmbedding(schemeText);

        if (!embedding) {
          console.warn(`⚠️ Failed to generate embedding for: ${scheme.scheme_name}`);
          skipped++;
          continue;
        }

        // Prepare payload
        const payload = {
          scheme_name: scheme.scheme_name,
          scheme_slug: schemeSlug,
          ministry: scheme.ministry || 'Unknown',
          description_short: scheme.brief_description || scheme.description || '',
          url: scheme.url || '',
          category: scheme.category || [],
          tags: scheme.tags || [],
          hard_filters: {
            min_income: scheme.min_income || 0,
            max_income: scheme.max_income || null,
            target_occupation: scheme.target_occupation || [],
            target_state: scheme.target_state || ['All'],
          },
          required_documents: scheme.required_documents || [],
          content_hash: newHash,
          level: scheme.level || 'Central',
        };

        // Create unique ID from slug
        const schemeId = parseInt(createHash('md5').update(schemeSlug).digest('hex'), 16);

        pointsToUpsert.push({
          id: schemeId,
          vector: embedding,
          payload: payload,
        });

        // Update database metadata
        await upsertSchemeMetadata(scheme.scheme_name, schemeSlug, newHash);

        if (existingMetadata) {
          console.log(`♻️  Updated: ${scheme.scheme_name}`);
          updated++;
        } else {
          console.log(`✨ New: ${scheme.scheme_name}`);
          updated++;
        }

        processed++;
      } catch (error) {
        console.error(`❌ Error processing scheme ${scheme.scheme_name}:`, error.message);
        skipped++;
      }

      // Rate limiting to avoid Hugging Face API throttling
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Batch upsert to Qdrant
    if (pointsToUpsert.length > 0) {
      console.log(`\n📤 Uploading ${pointsToUpsert.length} schemes to Qdrant...`);
      await upsertSchemeBatch(pointsToUpsert);
      console.log('✅ Successfully uploaded schemes to Qdrant');
    }

    return { processed, updated, skipped };
  } catch (error) {
    console.error('Error in processAndEmbedSchemes:', error.message);
    return { processed: 0, updated: 0, skipped: 0 };
  }
};

// ============================================
// SCHEDULED EXECUTION
// ============================================

/**
 * Execute scraper (for manual triggering)
 * @returns {Promise<void>}
 */
const executeScraper = async () => {
  try {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 Starting Periodic Scraper Task');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log('='.repeat(50) + '\n');

    initializeScraper();

    const result = await processAndEmbedSchemes();

    console.log('\n' + '='.repeat(50));
    console.log('📊 Scraper Summary:');
    console.log(`   Total Processed: ${result.processed}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped (unchanged): ${result.skipped}`);
    console.log(`✅ Scraper Task Completed at ${new Date().toISOString()}`);
    console.log('='.repeat(50) + '\n');
  } catch (error) {
    console.error('❌ Scraper task failed:', error.message);
  }
};

/**
 * Start the periodic scraper schedule
 * Uses cron expression: "0 2 * * *" = Daily at 2 AM
 * @returns {Promise<void>}
 */
const startScraperSchedule = async () => {
  try {
    const scheduleExpression = process.env.SCRAPER_SCHEDULE || '0 2 * * *';

    console.log(`📅 Scheduling scraper with cron: ${scheduleExpression}`);
    console.log('   (Daily at 2:00 AM UTC)\n');

    // Schedule the task
    schedule(scheduleExpression, async () => {
      await executeScraper();
    });

    // Run immediately on startup (optional)
    console.log('Running scraper on startup...\n');
    await executeScraper();

    console.log('✅ Scraper scheduler started\n');
  } catch (error) {
    console.error('Error starting scraper schedule:', error.message);
    throw error;
  }
};

module.exports = {
  startScraperSchedule,
  executeScraper,
  processAndEmbedSchemes,
  loadSchemesFromFiles,
};
