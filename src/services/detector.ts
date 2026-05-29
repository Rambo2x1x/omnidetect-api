/**
 * Service to analyze text for AI signatures using linguistic heuristics.
 */

interface DetectionResult {
  aiProbability: number; // 0 to 100
  label: 'Human' | 'Mixed' | 'AI';
  metrics: {
    wordCount: number;
    sentenceCount: number;
    lexicalDiversity: number; // unique words ratio
    burstiness: number; // sentence length standard deviation
    predictabilityScore: number; // predictability estimate
    aiKeywordDensity: number;
  };
  sentences: {
    text: string;
    wordCount: number;
    aiScore: number; // 0 to 100
  }[];
}

const AI_SIGNATURE_WORDS = [
  'delve', 'testament', 'furthermore', 'moreover', 'pivotal', 
  'demystify', 'notably', 'in conclusion', 'it is important to remember',
  'it is crucial to note', 'not only', 'but also', 'tapestry', 'beacon',
  'revolutionize', 'foster', 'synergy', 'meticulously', 'hurdle'
];

/**
 * Run semantic analysis on target text string.
 */
export function analyzeText(text: string): DetectionResult {
  // Normalize and clean text
  const cleanText = text.trim();
  if (!cleanText) {
    return {
      aiProbability: 0,
      label: 'Human',
      metrics: { wordCount: 0, sentenceCount: 0, lexicalDiversity: 0, burstiness: 0, predictabilityScore: 0, aiKeywordDensity: 0 },
      sentences: []
    };
  }

  // Split into sentences using punctuation markers
  const sentenceArray = cleanText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const words = cleanText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  
  const wordCount = words.length;
  const sentenceCount = sentenceArray.length;

  // 1. Calculate Lexical Diversity (Unique Words Ratio)
  const uniqueWords = new Set(words);
  const lexicalDiversity = wordCount > 0 ? parseFloat((uniqueWords.size / wordCount).toFixed(4)) : 1;

  // 2. Calculate Burstiness (Standard Deviation of Sentence Lengths)
  const sentenceWordCounts = sentenceArray.map(s => s.split(/\s+/).filter(Boolean).length);
  const avgSentenceLength = sentenceCount > 0 ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceCount : 0;
  
  let burstiness = 0;
  if (sentenceCount > 1) {
    const variance = sentenceWordCounts.reduce((sum, len) => sum + Math.pow(len - avgSentenceLength, 2), 0) / sentenceCount;
    burstiness = parseFloat(Math.sqrt(variance).toFixed(4));
  }

  // 3. Scan for AI keywords density
  let keywordCount = 0;
  words.forEach(w => {
    if (AI_SIGNATURE_WORDS.includes(w)) {
      keywordCount++;
    }
  });
  // Check for multi-word phrases manually in text
  const lowercaseText = cleanText.toLowerCase();
  if (lowercaseText.includes('it is important to remember')) keywordCount += 2;
  if (lowercaseText.includes('it is crucial to note')) keywordCount += 2;
  if (lowercaseText.includes('in conclusion')) keywordCount += 1;

  const aiKeywordDensity = wordCount > 0 ? parseFloat((keywordCount / wordCount).toFixed(4)) : 0;

  // 4. Calculate Predictability Score (Perplexity Estimator)
  // AI text has extremely predictable structures, low transition variance, and repetitive patterns
  let predictabilityScore = 50.0;
  if (wordCount > 5) {
    // If burstiness is very low, predictability is high
    const burstinessImpact = Math.max(0, 30 - (burstiness * 4));
    // If lexical diversity is low, predictability is high
    const diversityImpact = Math.max(0, (1 - lexicalDiversity) * 50);
    predictabilityScore = parseFloat(Math.min(100, Math.max(0, 40 + burstinessImpact + diversityImpact)).toFixed(2));
  }

  // ==========================================================
  // FINAL SCORING FORMULA
  // ==========================================================
  // AI is flagged by:
  // - Low burstiness (burstiness < 3.5)
  // - Low lexical diversity (repetitive vocabulary)
  // - High predictability (predictabilityScore > 70)
  // - Presence of AI signature transition markers
  let baseScore = 0;

  if (wordCount > 0) {
    // Predictability contribution
    baseScore += predictabilityScore * 0.45;
    
    // Burstiness contribution (low burstiness = high AI probability)
    const burstinessScore = Math.max(0, 100 - (burstiness * 15));
    baseScore += burstinessScore * 0.35;

    // Keyword density contribution
    const keywordScore = Math.min(100, aiKeywordDensity * 800);
    baseScore += keywordScore * 0.20;
  }

  const finalAiProbability = Math.min(100, Math.max(0, Math.round(baseScore)));

  // Determine label category
  let label: 'Human' | 'Mixed' | 'AI' = 'Human';
  if (finalAiProbability > 65) {
    label = 'AI';
  } else if (finalAiProbability > 35) {
    label = 'Mixed';
  }

  // Sentence-by-sentence analysis
  const sentencesResult = sentenceArray.map(s => {
    const sWords = s.split(/\s+/).filter(Boolean);
    const sWordCount = sWords.length;
    
    // Evaluate individual sentence likelihood of being AI
    let sScore = 20;
    // Sentence length near average AI length (14 words) with no variance
    const distToAiLength = Math.abs(sWordCount - 14);
    sScore += Math.max(0, 30 - (distToAiLength * 2.5));

    // Keyword hits in sentence
    sWords.forEach(w => {
      if (AI_SIGNATURE_WORDS.includes(w.toLowerCase().replace(/[^\w]/g, ''))) {
        sScore += 25;
      }
    });

    return {
      text: s,
      wordCount: sWordCount,
      aiScore: Math.min(100, sScore)
    };
  });

  return {
    aiProbability: finalAiProbability,
    label,
    metrics: {
      wordCount,
      sentenceCount,
      lexicalDiversity,
      burstiness,
      predictabilityScore,
      aiKeywordDensity
    },
    sentences: sentencesResult
  };
}
