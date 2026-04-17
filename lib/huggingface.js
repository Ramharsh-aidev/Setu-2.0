/**
 * ============================================
 * HUGGING FACE LLM SERVICE
 * ============================================
 * Handles all LLM operations using Hugging Face Inference API
 */

const { HfInference } = require('@huggingface/inference');

let hf;

const initializeHuggingFace = async () => {
  try {
    hf = new HfInference(process.env.HF_API_TOKEN);
    console.log('✅ Hugging Face client initialized');
    console.log(`📝 Model: ${process.env.HF_MODEL_ID || 'default'}`);
  } catch (error) {
    console.error('❌ Failed to initialize Hugging Face:', error.message);
    throw error;
  }
};

// ============================================
// LLM OPERATIONS
// ============================================

/**
 * Extract entities from user's spoken message
 * @param {string} userMessage - The user's message
 * @param {string} previousContext - Previous conversation context (optional)
 * @returns {Promise<Object>} Extracted entities like income, occupation, location, etc.
 */
const extractEntities = async (userMessage, previousContext = '') => {
  try {
    const systemPrompt = `You are an expert at extracting information from conversations about Indian government schemes.
Extract the following entities from the user's message in JSON format:
- income (number, in rupees, or null)
- occupation (string like "farmer", "student", "retired", etc., or null)
- location (string, state name or null)
- age (number or null)
- family_size (number or null)
- disabilities (array of strings or null)
- gender (string or null)

If an entity is not mentioned, use null.
Return ONLY valid JSON, no other text.`;

    const userPrompt = `Previous context: ${previousContext}\n\nCurrent message: "${userMessage}"`;

    const response = await hf.textGeneration({
      model: process.env.HF_MODEL_ID || 'meta-llama/Llama-2-7b-chat-hf',
      inputs: `${systemPrompt}\n\n${userPrompt}`,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.3,
      },
    });

    // Parse the response
    let extractedText = response.generated_text || '';
    // Remove the prompt from the output
    extractedText = extractedText.replace(systemPrompt, '').replace(userPrompt, '').trim();

    try {
      const entities = JSON.parse(extractedText);
      return entities;
    } catch (e) {
      console.warn('Could not parse entities JSON:', extractedText);
      return {};
    }
  } catch (error) {
    console.error('Error extracting entities:', error.message);
    return {};
  }
};

/**
 * Generate a helpful response based on schemes and user context
 * @param {string} userQuery - The user's question
 * @param {Array} relevantSchemes - Relevant schemes from Qdrant search
 * @param {Object} userContext - User's extracted entities and history
 * @param {string} language - Language code (default: 'en', can be 'hi', 'mr', 'ta', etc.)
 * @returns {Promise<string>} The AI's response
 */
const generateResponse = async (userQuery, relevantSchemes = [], userContext = {}, language = 'en') => {
  try {
    // Format schemes for the prompt
    let schemesText = '';
    if (relevantSchemes && relevantSchemes.length > 0) {
      schemesText = 'Potentially relevant schemes:\n';
      relevantSchemes.forEach((scheme, index) => {
        const payload = scheme.payload || {};
        schemesText += `${index + 1}. ${payload.scheme_name || 'Unknown Scheme'}\n`;
        schemesText += `   Description: ${payload.description_short || 'N/A'}\n`;
        schemesText += `   Eligibility: Income < ${payload.max_income || 'N/A'}, Occupation: ${payload.target_occupation?.join(', ') || 'Any'}\n`;
        schemesText += `   URL: ${payload.url || 'N/A'}\n\n`;
      });
    }

    // Build user context string
    let contextText = '';
    if (Object.keys(userContext).length > 0) {
      contextText = `User Profile:\n`;
      if (userContext.income) contextText += `- Income: ₹${userContext.income}\n`;
      if (userContext.occupation) contextText += `- Occupation: ${userContext.occupation}\n`;
      if (userContext.location) contextText += `- Location: ${userContext.location}\n`;
      if (userContext.age) contextText += `- Age: ${userContext.age}\n`;
      if (userContext.family_size) contextText += `- Family Size: ${userContext.family_size}\n`;
    }

    const systemPrompt = `You are Setu, a helpful AI assistant for Indian government schemes. You are warm, empathetic, and clear in your explanations.
The user may be from a low-literacy background, so keep your language simple and in ${language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : 'English'}.

${contextText}

${schemesText}

Your task:
1. Answer the user's question about government schemes
2. Explain why they are eligible or not eligible for specific schemes
3. Be clear about income limits and eligibility criteria
4. Ask for missing information if needed
5. Be encouraging and supportive

Keep response concise and conversational.`;

    const response = await hf.textGeneration({
      model: process.env.HF_MODEL_ID || 'meta-llama/Llama-2-7b-chat-hf',
      inputs: `${systemPrompt}\n\nUser asks: "${userQuery}"\n\nAssistant:`,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
      },
    });

    let assistantResponse = response.generated_text || '';
    // Remove the prompt from the output
    assistantResponse = assistantResponse.substring(
      assistantResponse.indexOf('Assistant:') + 'Assistant:'.length
    ).trim();

    return assistantResponse;
  } catch (error) {
    console.error('Error generating response:', error.message);
    return 'I apologize, I encountered an error processing your request. Please try again.';
  }
};

/**
 * Generate a summary of the conversation
 * @param {Array} conversationTurns - Array of {role, content} objects
 * @returns {Promise<string>} Conversation summary
 */
const generateSummary = async (conversationTurns) => {
  try {
    const conversationText = conversationTurns
      .map(turn => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
      .join('\n\n');

    const response = await hf.textGeneration({
      model: process.env.HF_MODEL_ID || 'meta-llama/Llama-2-7b-chat-hf',
      inputs: `Please summarize this conversation about government schemes in 2-3 sentences:\n\n${conversationText}\n\nSummary:`,
      parameters: {
        max_new_tokens: 200,
        temperature: 0.5,
      },
    });

    let summary = response.generated_text || '';
    summary = summary.substring(summary.indexOf('Summary:') + 'Summary:'.length).trim();

    return summary;
  } catch (error) {
    console.error('Error generating summary:', error.message);
    return '';
  }
};

/**
 * Check eligibility for specific scheme based on user context
 * @param {Object} scheme - Scheme object from Qdrant
 * @param {Object} userContext - User's extracted entities
 * @returns {Promise<Object>} {eligible: boolean, reasons: string[], missingInfo: string[]}
 */
const checkEligibility = async (scheme, userContext) => {
  try {
    const payload = scheme.payload || {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const eligible = true;
    const reasons = [];
    const missingInfo = [];

    // Check income eligibility
    if (payload.max_income && userContext.income) {
      if (userContext.income <= payload.max_income) {
        reasons.push(`Your income (₹${userContext.income}) is within the scheme limit (₹${payload.max_income})`);
      } else {
        return {
          eligible: false,
          reasons: [`Your income (₹${userContext.income}) exceeds the scheme limit (₹${payload.max_income})`],
          missingInfo: [],
        };
      }
    } else if (payload.max_income && !userContext.income) {
      missingInfo.push('income');
    }

    // Check occupation eligibility
    if (payload.target_occupation && payload.target_occupation.length > 0) {
      if (userContext.occupation && payload.target_occupation.includes(userContext.occupation)) {
        reasons.push(`You are a ${userContext.occupation}, which is eligible for this scheme`);
      } else if (!userContext.occupation) {
        missingInfo.push('occupation');
      } else {
        return {
          eligible: false,
          reasons: [`This scheme is only for ${payload.target_occupation.join(', ')}`],
          missingInfo: [],
        };
      }
    }

    // Check location eligibility
    if (payload.target_state && payload.target_state.length > 0 && !payload.target_state.includes('All')) {
      if (userContext.location && payload.target_state.includes(userContext.location)) {
        reasons.push(`This scheme is available in ${userContext.location}`);
      } else if (!userContext.location) {
        missingInfo.push('location');
      } else {
        return {
          eligible: false,
          reasons: [`This scheme is only available in ${payload.target_state.join(', ')}`],
          missingInfo: [],
        };
      }
    }

    return {
      eligible: missingInfo.length === 0,
      reasons,
      missingInfo,
    };
  } catch (error) {
    console.error('Error checking eligibility:', error.message);
    return {
      eligible: false,
      reasons: ['Could not determine eligibility'],
      missingInfo: [],
    };
  }
};

module.exports = {
  initializeHuggingFace,
  extractEntities,
  generateResponse,
  generateSummary,
  checkEligibility,
};
