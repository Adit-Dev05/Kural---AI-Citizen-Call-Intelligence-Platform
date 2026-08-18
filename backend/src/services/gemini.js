/**
 * Gemini classification service — with two layers of resilience.
 *
 * LAYER 1: Gemini API call with retry on 503 (up to 2 retries, 3 attempts total).
 * LAYER 2: Rule-based keyword fallback if Gemini fails entirely.
 *
 * Always returns a result — never throws. The caller can check `classified_by`
 * to know whether AI or rule-based classification was used.
 */

const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// ─── Fixed Department Taxonomy ──────────────────────────────────────────────
const VALID_DEPARTMENTS = [
  'Sanitation / Solid Waste Management',
  'Roads & Infrastructure',
  'Water Supply',
  'Storm Water Drainage / Sewerage',
  'Street Lighting / Electricity',
  'Public Health',
  'General Grievance',
];

// ─── Keyword Sets for Rule-Based Fallback ───────────────────────────────────
const DEPARTMENT_KEYWORDS = {
  'Sanitation / Solid Waste Management': ['garbage', 'trash', 'waste', 'rubbish', 'dump', 'foul smell', 'stink', 'public toilet', 'latrine', 'landfill', 'municipal waste', 'sweeper', 'dustbin', 'cleaning', 'sanitation'],
  'Roads & Infrastructure': ['pothole', 'road damage', 'broken road', 'footpath', 'pavement', 'bridge', 'culvert', 'construction debris', 'road block', 'damaged road', 'broken pavement', 'asphalt', 'tar', 'speed breaker'],
  'Water Supply': ['water shortage', 'no water', 'water supply', 'tap water', 'pipeline', 'pipe leak', 'pipe burst', 'contaminated water', 'dirty water', 'water tank', 'borewell', 'water tanker', 'low water pressure', 'water cut', 'drinking water'],
  'Storm Water Drainage / Sewerage': ['sewage', 'sewer', 'drain', 'drainage', 'gutter', 'overflow', 'clogged drain', 'manhole', 'water logging', 'flooded street', 'storm water'],
  'Street Lighting / Electricity': ['power cut', 'power outage', 'electricity', 'voltage', 'transformer', 'streetlight', 'street light', 'fused', 'short circuit', 'electric wire', 'power meter', 'blackout', 'load shedding', 'electric pole', 'sparking wire', 'lamp post'],
  'Public Health': ['hospital', 'clinic', 'ambulance', 'disease outbreak', 'epidemic', 'dengue', 'malaria', 'medical emergency', 'doctor', 'nurse', 'vaccination', 'primary health centre', 'mosquito', 'stray dog', 'animal carcass'],
};

const URGENT_KEYWORDS = ['fire', 'flood', 'flooding', 'gas leak', 'electrocution', 'collapsed', 'drowning', 'emergency', 'life threatening'];
const FRUSTRATED_KEYWORDS = ['angry', 'furious', 'fed up', 'useless', 'pathetic', 'third time', 'no one is listening', 'disgusted'];

// ─── Gemini Response Schema ─────────────────────────────────────────────────
const classificationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    issue_type: {
      type: SchemaType.STRING,
      description: 'A short label for the type of issue (e.g. "sewage overflow", "power outage", "pothole")',
    },
    department: {
      type: SchemaType.STRING,
      description: `The government department to route this to. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`,
      enum: VALID_DEPARTMENTS,
    },
    location: {
      type: SchemaType.STRING,
      description: 'The location or area mentioned in the complaint. Use "Not specified" if no location is mentioned.',
    },
    urgency: {
      type: SchemaType.STRING,
      description: 'How urgent this complaint is based on the content',
      enum: ['low', 'medium', 'urgent'],
    },
    sentiment: {
      type: SchemaType.STRING,
      description: 'The emotional tone of the citizen',
      enum: ['neutral', 'frustrated', 'angry'],
    },
    summary: {
      type: SchemaType.STRING,
      description: 'A single-sentence summary of the issue itself. DO NOT include any location details or addresses in this summary.',
    },
    broad_location: {
      type: SchemaType.STRING,
      description: 'CRITICAL: Return ONLY the broad neighborhood or locality name and city (e.g., "Vaishnavi Nagar, Chennai"). You MUST strip out ALL house numbers, street names, cross roads, and pin codes. If you include a street or house number, the map will fail.',
    },
  },
  required: ['issue_type', 'department', 'location', 'urgency', 'sentiment', 'summary', 'broad_location'],
};

const CLASSIFICATION_PROMPT = `You are a government complaint classification system. Analyze the following citizen complaint (which may be a call transcript or a typed message) and extract structured information.

Rules:
- Department MUST be exactly one of: ${VALID_DEPARTMENTS.join(', ')}
- If the complaint doesn't clearly match a specific department, use "General Grievance"
- Urgency should be "urgent" only for genuinely dangerous situations (flooding, fire, electrocution risk, gas leak, medical emergency, violence)
- Location should be extracted as-is from the text for the official record; use "Not specified" if none mentioned
- broad_location must be a simplified, highly geocodable locality name (e.g. "T Nagar, Chennai")
- Summary should be one clear sentence describing ONLY the issue. DO NOT include the address/location in the summary!
- Sentiment reflects the citizen's emotional tone. If the user mentions long delays (e.g., "for a week", "still not done", "again"), you MUST classify them as "frustrated" even if they don't use angry words.

Citizen complaint:
`;

// ─── Layer 1: Gemini with Retry ─────────────────────────────────────────────

/**
 * Call Gemini API with retry on 503 errors.
 * Retries up to 2 times (3 total attempts) with a 1-second delay between retries.
 * On non-503 errors, fails immediately without retrying.
 *
 * @param {string} text - The complaint text to classify
 * @returns {Promise<Object>} Parsed classification result from Gemini
 * @throws {Error} If all retries fail or a non-retryable error occurs
 */
async function callGeminiWithRetry(text) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: classificationSchema,
    },
  });

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(CLASSIFICATION_PROMPT + text);
      const response = result.response;
      const parsed = JSON.parse(response.text());

      // Defensive: ensure department is in the valid list
      if (!VALID_DEPARTMENTS.includes(parsed.department)) {
        console.warn(`[Gemini] Unknown department "${parsed.department}", falling back to General Grievance`);
        parsed.department = 'General Grievance';
      }

      return parsed;
    } catch (err) {
      const is503 = err.status === 503 ||
        err.message?.includes('503') ||
        err.message?.includes('UNAVAILABLE') ||
        err.message?.includes('overloaded');

      if (is503 && attempt < MAX_ATTEMPTS) {
        console.warn(`[Gemini] 503 error on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in 1s...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Non-503 error or final attempt exhausted — rethrow
      console.error(`[Gemini] Failed on attempt ${attempt}/${MAX_ATTEMPTS}:`, err.message);
      throw err;
    }
  }
}

// ─── Layer 2: Rule-Based Keyword Fallback ───────────────────────────────────

/**
 * Classify a complaint using keyword matching when Gemini is unavailable.
 *
 * Matching logic:
 * - 0 departments match → General Grievance
 * - 1 department matches → use that department
 * - 2+ departments match → General Grievance (ambiguous, needs human judgment)
 *
 * @param {string} text - The raw complaint text
 * @returns {Object} Classification result with all required fields
 */
function keywordFallbackClassify(text) {
  const lowerText = text.toLowerCase();

  // Count which departments have at least one keyword match
  const matchedDepartments = [];
  for (const [department, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    const hasMatch = keywords.some((keyword) => lowerText.includes(keyword));
    if (hasMatch) {
      matchedDepartments.push(department);
    }
  }

  // Department decision
  let department;
  if (matchedDepartments.length === 1) {
    department = matchedDepartments[0];
  } else {
    // 0 matches (no clue) or 2+ matches (ambiguous) → General Grievance
    if (matchedDepartments.length >= 2) {
      console.log(`[Fallback] Ambiguous match across ${matchedDepartments.length} departments: ${matchedDepartments.join(', ')} → General Grievance`);
    }
    department = 'General Grievance';
  }

  // Urgency: default medium, escalate to urgent on danger keywords
  const isUrgent = URGENT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
  const urgency = isUrgent ? 'urgent' : 'medium';

  // Sentiment: default neutral, escalate to frustrated on frustration keywords
  const isFrustrated = FRUSTRATED_KEYWORDS.some((keyword) => lowerText.includes(keyword));
  const sentiment = isFrustrated ? 'frustrated' : 'neutral';

  // Summary: first ~150 characters of the raw text as a rough summary
  const summary = text.length > 150 ? text.substring(0, 147) + '...' : text;

  return {
    issue_type: 'Unclassified — needs review',
    department,
    location: 'Not specified',
    urgency,
    sentiment,
    summary,
    broad_location: 'Chennai', // Fallback
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify a citizen complaint. Always returns a result — never throws.
 *
 * Tries Gemini first (with retry on 503), falls back to keyword matching
 * if Gemini is completely unavailable. The `classified_by` field in the
 * return value tells the caller which method was used.
 *
 * @param {string} text - The call transcript or typed complaint text
 * @returns {Promise<Object>} Classification result with `classified_by: 'ai' | 'rules'`
 */
async function classifyComplaint(text) {
  // Layer 1: Try Gemini with retry
  try {
    const result = await callGeminiWithRetry(text);
    console.log('[Gemini] Classification result (AI):', result);
    return { ...result, classified_by: 'ai' };
  } catch (err) {
    console.error('[Gemini] All attempts failed, falling back to keyword classification:', err.message);
  }

  // Layer 2: Rule-based keyword fallback
  const fallbackResult = keywordFallbackClassify(text);
  console.log('[Fallback] Classification result (rules):', fallbackResult);
  return { ...fallbackResult, classified_by: 'rules' };
}

module.exports = { classifyComplaint, VALID_DEPARTMENTS };
