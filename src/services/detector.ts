/**
 * Service to analyze text for AI signatures using statistical heuristics and optional LLM validation.
 */

export interface DetectionResult {
  aiProbability: number; // 0 to 100
  label: 'Human' | 'Mixed' | 'AI';
  language: string;
  classifiers: {
    gptProbability: number;
    claudeProbability: number;
    geminiProbability: number;
    llamaProbability: number;
  };
  metrics: {
    wordCount: number;
    sentenceCount: number;
    lexicalDiversity: number; // TTR
    giraudIndex: number;      // Giraud richness index
    herdanIndex: number;      // Herdan's C index
    entropy: number;          // Shannon word entropy
    burstiness: number;       // Sentence length standard deviation
    predictabilityScore: number;
    aiKeywordDensity: number;
    bigramRepetitionRatio: number;
    trigramRepetitionRatio: number;
  };
  sentences: {
    text: string;
    wordCount: number;
    aiScore: number;
    highlightRisk: 'low' | 'medium' | 'high';
  }[];
  hybridScanPerformed: boolean;
}

// Stop words list per language to perform lightweight language detection
const STOP_WORDS: Record<string, string[]> = {
  en: ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this'],
  es: ['el', 'la', 'los', 'de', 'y', 'en', 'que', 'un', 'una', 'con', 'para', 'se', 'no', 'por', 'lo', 'su', 'al', 'del', 'como', 'es'],
  fr: ['le', 'la', 'les', 'de', 'et', 'en', 'que', 'un', 'une', 'dans', 'pour', 'se', 'ne', 'par', 'ce', 'qui', 'sur', 'avec', 'est', 'du'],
  de: ['der', 'die', 'das', 'und', 'ist', 'in', 'zu', 'den', 'von', 'mit', 'es', 'für', 'sich', 'nicht', 'auf', 'mit', 'dem', 'des', 'ein'],
  pt: ['o', 'a', 'os', 'de', 'e', 'em', 'que', 'um', 'uma', 'com', 'para', 'se', 'não', 'por', 'como', 'sua', 'ao', 'do', 'da', 'mais'],
  it: ['il', 'la', 'i', 'di', 'e', 'in', 'che', 'un', 'una', 'con', 'per', 'si', 'non', 'da', 'lo', 'su', 'al', 'del', 'come', 'ha']
};

// AI markers mapping per language
const AI_MARKERS: Record<string, { markers: string[]; weights: Record<string, number>; classifiers: Record<string, string> }> = {
  en: {
    markers: ['delve', 'testament', 'furthermore', 'moreover', 'notably', 'in conclusion', 'tapestry', 'foster', 'beacon', 'it is important to remember', 'it is crucial to note', 'hurdle', 'meticulously', 'revolutionize', 'demystify', 'synergy', 'pivotal', 'crucial', 'resonate', 'dynamic', 'paradigm', 'underscore', 'leverage', 'optimize'],
    weights: {
      'delve': 2.5, 'tapestry': 2.5, 'testament': 2.0, 'foster': 1.8, 'beacon': 2.0,
      'meticulously': 2.0, 'revolutionize': 1.8, 'demystify': 1.8, 'synergy': 1.8, 'pivotal': 1.5,
      'it is important to remember': 2.5, 'it is crucial to note': 2.5, 'in conclusion': 1.5,
      'furthermore': 1.2, 'moreover': 1.2, 'leverage': 1.5, 'optimize': 1.5, 'underscore': 1.3
    },
    classifiers: {
      'delve': 'gpt', 'tapestry': 'claude', 'testament': 'gpt', 'foster': 'claude',
      'beacon': 'claude', 'meticulously': 'claude', 'revolutionize': 'gemini',
      'demystify': 'gemini', 'synergy': 'gemini', 'pivotal': 'gemini',
      'it is important to remember': 'claude', 'it is crucial to note': 'claude',
      'in conclusion': 'gpt', 'furthermore': 'gpt', 'moreover': 'gpt', 'leverage': 'llama',
      'optimize': 'llama', 'underscore': 'llama'
    }
  },
  es: {
    markers: ['además', 'en conclusión', 'por lo tanto', 'es importante recordar', 'cabe destacar', 'crucial', 'fomentar', 'meticulosamente', 'revolucionar', 'sinergia', 'testimonio', 'profundizar', 'tapiz', 'faro', 'obstáculo', 'desmitificar', 'fundamental', 'subrayar', 'apalancar', 'optimizar'],
    weights: {
      'profundizar': 2.5, 'tapiz': 2.5, 'testimonio': 2.0, 'fomentar': 1.8, 'faro': 2.0,
      'meticulosamente': 2.0, 'revolucionar': 1.8, 'desmitificar': 1.8, 'sinergia': 1.8, 'fundamental': 1.5,
      'es importante recordar': 2.5, 'cabe destacar': 2.5, 'en conclusión': 1.5, 'además': 1.2, 'por lo tanto': 1.2
    },
    classifiers: {
      'profundizar': 'gpt', 'tapiz': 'claude', 'testimonio': 'gpt', 'fomentar': 'claude',
      'faro': 'claude', 'meticulosamente': 'claude', 'revolucionar': 'gemini',
      'desmitificar': 'gemini', 'sinergia': 'gemini', 'fundamental': 'gemini',
      'es importante recordar': 'claude', 'cabe destacar': 'claude',
      'en conclusión': 'gpt', 'además': 'gpt', 'por lo tanto': 'gpt'
    }
  },
  fr: {
    markers: ['de plus', 'en conclusion', 'par conséquent', 'il est important de se rappeler', 'il convient de noter', 'crucial', 'favoriser', 'méticuleusement', 'révolutionner', 'synergie', 'témoignage', 'approfondir', 'tapisserie', 'phare', 'obstacle', 'démystifier', 'charnière', 'souligner', 'tirer parti', 'optimiser'],
    weights: {
      'approfondir': 2.5, 'tapisserie': 2.5, 'témoignage': 2.0, 'favoriser': 1.8, 'phare': 2.0,
      'méticuleusement': 2.0, 'révolutionner': 1.8, 'démystifier': 1.8, 'synergie': 1.8, 'charnière': 1.5,
      'il est important de se rappeler': 2.5, 'il convient de noter': 2.5, 'en conclusion': 1.5,
      'de plus': 1.2, 'par conséquent': 1.2
    },
    classifiers: {
      'approfondir': 'gpt', 'tapisserie': 'claude', 'témoignage': 'gpt', 'favoriser': 'claude',
      'phare': 'claude', 'méticuleusement': 'claude', 'révolutionner': 'gemini',
      'démystifier': 'gemini', 'synergie': 'gemini', 'charnière': 'gemini',
      'il est important de se rappeler': 'claude', 'il convient de noter': 'claude',
      'en conclusion': 'gpt', 'de plus': 'gpt', 'par conséquent': 'gpt'
    }
  },
  de: {
    markers: ['darüber hinaus', 'zusammenfassend', 'daher', 'es ist wichtig zu bedenken', 'es ist wichtig zu beachten', 'entscheidend', 'fördern', 'akribisch', 'revolutionieren', 'synergie', 'zeugnis', 'eintauchen', 'wandteppich', 'leuchtfeuer', 'hürde', 'demystifizieren', 'schlüsselrolle', 'unterstreichen', 'nutzen', 'optimieren'],
    weights: {
      'eintauchen': 2.5, 'wandteppich': 2.5, 'zeugnis': 2.0, 'fördern': 1.8, 'leuchtfeuer': 2.0,
      'akribisch': 2.0, 'revolutionieren': 1.8, 'demystifizieren': 1.8, 'synergie': 1.8, 'schlüsselrolle': 1.5,
      'es ist wichtig zu bedenken': 2.5, 'es ist wichtig zu beachten': 2.5, 'zusammenfassend': 1.5,
      'darüber hinaus': 1.2, 'daher': 1.2
    },
    classifiers: {
      'eintauchen': 'gpt', 'wandteppich': 'claude', 'zeugnis': 'gpt', 'fördern': 'claude',
      'leuchtfeuer': 'claude', 'akribisch': 'claude', 'revolutionieren': 'gemini',
      'demystifizieren': 'gemini', 'synergie': 'gemini', 'schlüsselrolle': 'gemini',
      'es ist wichtig zu bedenken': 'claude', 'es ist wichtig zu beachten': 'claude',
      'zusammenfassend': 'gpt', 'darüber hinaus': 'gpt', 'daher': 'gpt'
    }
  },
  pt: {
    markers: ['além disso', 'em conclusão', 'portanto', 'é importante lembrar', 'vale a pena notar', 'crucial', 'promover', 'meticulosamente', 'revolucionar', 'sinergia', 'testemunho', 'aprofundar', 'tapeçaria', 'farol', 'obstáculo', 'desmistificar', 'fundamental', 'sublinhar', 'alavancar', 'otimizar'],
    weights: {
      'aprofundar': 2.5, 'tapeçaria': 2.5, 'testemunho': 2.0, 'promover': 1.8, 'farol': 2.0,
      'meticulosamente': 2.0, 'revolucionar': 1.8, 'desmistificar': 1.8, 'sinergia': 1.8, 'fundamental': 1.5,
      'é importante lembrar': 2.5, 'vale a pena notar': 2.5, 'em conclusão': 1.5, 'além disso': 1.2, 'portanto': 1.2
    },
    classifiers: {
      'aprofundar': 'gpt', 'tapeçaria': 'claude', 'testemunho': 'gpt', 'promover': 'claude',
      'farol': 'claude', 'meticulosamente': 'claude', 'revolucionar': 'gemini',
      'desmistificar': 'gemini', 'sinergia': 'gemini', 'fundamental': 'gemini',
      'é importante lembrar': 'claude', 'vale a pena notar': 'claude',
      'em conclusão': 'gpt', 'além disso': 'gpt', 'portanto': 'gpt'
    }
  },
  it: {
    markers: ['inoltre', 'in conclusione', 'pertanto', 'è importante ricordare', 'è fondamentale notare', 'cruciale', 'promuovere', 'meticolosamente', 'rivoluzionare', 'sinergia', 'testimonianza', 'approfondire', 'arazzo', 'farò', 'ostacolo', 'demistificare', 'fondamentale', 'sottolineare', 'sfruttare', 'ottimizzare'],
    weights: {
      'approfondire': 2.5, 'arazzo': 2.5, 'testimonianza': 2.0, 'promuovere': 1.8, 'farò': 2.0,
      'meticolosamente': 2.0, 'rivoluzionare': 1.8, 'demistificare': 1.8, 'sinergia': 1.8, 'fondamentale': 1.5,
      'è importante ricordare': 2.5, 'è fondamentale notare': 2.5, 'in conclusione': 1.5, 'inoltre': 1.2, 'pertanto': 1.2
    },
    classifiers: {
      'approfondire': 'gpt', 'arazzo': 'claude', 'testimonianza': 'gpt', 'promuovere': 'claude',
      'farò': 'claude', 'meticolosamente': 'claude', 'rivoluzionare': 'gemini',
      'demistificare': 'gemini', 'sinergia': 'gemini', 'fondamentale': 'gemini',
      'è importante ricordare': 'claude', 'è fondamentale notare': 'claude',
      'in conclusione': 'gpt', 'inoltre': 'gpt', 'pertanto': 'gpt'
    }
  }
};

/**
 * Perform lightweight frequency-based language identification
 */
export function detectLanguage(text: string): string {
  const words = text.toLowerCase().replace(/[^\w\s\u00C0-\u00FF]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'en';

  const scores: Record<string, number> = { en: 0, es: 0, fr: 0, de: 0, pt: 0, it: 0 };

  words.forEach(w => {
    for (const [lang, list] of Object.entries(STOP_WORDS)) {
      if (list.includes(w)) {
        scores[lang] = (scores[lang] || 0) + 1;
      }
    }
  });

  let bestLang = 'en';
  let maxScore = -1;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestLang = lang;
    }
  }

  return maxScore > 0 ? bestLang : 'en';
}

/**
 * Calculates Shannon Entropy of word frequencies
 */
function calculateWordEntropy(words: string[]): number {
  if (words.length === 0) return 0;
  const wordCounts: Record<string, number> = {};
  words.forEach(w => {
    wordCounts[w] = (wordCounts[w] || 0) + 1;
  });

  const n = words.length;
  let entropy = 0;
  for (const count of Object.values(wordCounts)) {
    const p = count / n;
    entropy -= p * Math.log2(p);
  }
  return parseFloat(entropy.toFixed(4));
}

/**
 * Analyzes bi-grams and tri-grams for repetition ratios
 */
function calculateNgramRepetition(words: string[]): { bigramRatio: number; trigramRatio: number } {
  if (words.length < 3) return { bigramRatio: 1.0, trigramRatio: 1.0 };

  const bigrams: string[] = [];
  const trigrams: string[] = [];

  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]}_${words[i+1]}`);
  }
  for (let i = 0; i < words.length - 2; i++) {
    trigrams.push(`${words[i]}_${words[i+1]}_${words[i+2]}`);
  }

  const uniqueBigrams = new Set(bigrams);
  const uniqueTrigrams = new Set(trigrams);

  return {
    bigramRatio: parseFloat((uniqueBigrams.size / bigrams.length).toFixed(4)),
    trigramRatio: parseFloat((uniqueTrigrams.size / trigrams.length).toFixed(4))
  };
}

/**
 * Call external LLM (Gemini or OpenAI) via fetch if keys are provided to perform hybrid verification.
 */
async function queryLLMForDetection(text: string): Promise<number | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze the following text and determine the probability (from 0 to 100) that it was written by an AI language model (like GPT-4, Claude, Gemini). Consider patterns, flow, vocabulary style, and burstiness. Output ONLY a single integer between 0 and 100 representing the score. Do not write any explanations or other words.
Text: "${text.substring(0, 4000)}"`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 5
          }
        })
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const match = responseText.match(/\d+/);
        if (match) return parseInt(match[0], 10);
      }
    } catch (err) {
      console.error('[LLM Detection] Gemini direct query failed:', err);
    }
  }

  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert AI detection system. Analyze the text and output a single integer from 0 to 100 representing the probability that the text is AI-generated. Respond with only the number.'
            },
            {
              role: 'user',
              content: text.substring(0, 4000)
            }
          ],
          temperature: 0.1,
          max_tokens: 5
        })
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const responseText = data.choices?.[0]?.message?.content?.trim() || '';
        const match = responseText.match(/\d+/);
        if (match) return parseInt(match[0], 10);
      }
    } catch (err) {
      console.error('[LLM Detection] OpenAI query failed:', err);
    }
  }

  return null;
}

/**
 * Run comprehensive statistical and linguistic analysis on target text.
 */
export async function analyzeText(text: string, options?: { hybrid?: boolean }): Promise<DetectionResult> {
  const cleanText = text.trim();
  const detectedLang = detectLanguage(cleanText);

  if (!cleanText) {
    return {
      aiProbability: 0,
      label: 'Human',
      language: 'en',
      classifiers: { gptProbability: 0, claudeProbability: 0, geminiProbability: 0, llamaProbability: 0 },
      metrics: {
        wordCount: 0, sentenceCount: 0, lexicalDiversity: 0, giraudIndex: 0, herdanIndex: 0,
        entropy: 0, burstiness: 0, predictabilityScore: 50, aiKeywordDensity: 0,
        bigramRepetitionRatio: 1.0, trigramRepetitionRatio: 1.0
      },
      sentences: [],
      hybridScanPerformed: false
    };
  }

  // Text Splitting and Lexical cleaning
  const sentenceArray = cleanText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const words = cleanText.toLowerCase().replace(/[^\w\s\u00C0-\u00FF]/g, '').split(/\s+/).filter(Boolean);

  const wordCount = words.length;
  const sentenceCount = sentenceArray.length;

  // 1. Lexical Richness & Diversity Calculations
  const uniqueWords = new Set(words);
  const lexicalDiversity = wordCount > 0 ? parseFloat((uniqueWords.size / wordCount).toFixed(4)) : 1;
  const giraudIndex = wordCount > 0 ? parseFloat((uniqueWords.size / Math.sqrt(wordCount)).toFixed(4)) : 0;
  const herdanIndex = wordCount > 1 ? parseFloat((Math.log(uniqueWords.size) / Math.log(wordCount)).toFixed(4)) : 1;

  // 2. Shannon Entropy calculation
  const entropy = calculateWordEntropy(words);

  // 3. Sentence Length Standard Deviation (Burstiness)
  const sentenceWordCounts = sentenceArray.map(s => s.split(/\s+/).filter(Boolean).length);
  const avgSentenceLength = sentenceCount > 0 ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceCount : 0;

  let burstiness = 0;
  if (sentenceCount > 1) {
    const variance = sentenceWordCounts.reduce((sum, len) => sum + Math.pow(len - avgSentenceLength, 2), 0) / sentenceCount;
    burstiness = parseFloat(Math.sqrt(variance).toFixed(4));
  }

  // 4. Repetition ratios (N-Grams)
  const { bigramRatio, trigramRatio } = calculateNgramRepetition(words);

  // 5. Keyword Density mapping
  const langConfig = AI_MARKERS[detectedLang] || AI_MARKERS['en'];
  let keywordWeightedScore = 0;
  let keywordCount = 0;

  const hits: Record<string, number> = { gpt: 0, claude: 0, gemini: 0, llama: 0 };

  // Scan single words
  words.forEach(w => {
    if (langConfig.markers.includes(w)) {
      keywordCount++;
      const weight = langConfig.weights[w] || 1.0;
      keywordWeightedScore += weight;
      const model = langConfig.classifiers[w];
      if (model && model in hits) {
        hits[model]++;
      }
    }
  });

  // Scan multi-word phrases manually in text
  const lowercaseText = cleanText.toLowerCase();
  langConfig.markers.forEach(marker => {
    if (marker.includes(' ')) {
      // Find all matches of the phrase
      let pos = lowercaseText.indexOf(marker);
      while (pos !== -1) {
        keywordCount++;
        keywordWeightedScore += langConfig.weights[marker] || 2.0;
        const model = langConfig.classifiers[marker];
        if (model && model in hits) {
          hits[model] += 2;
        }
        pos = lowercaseText.indexOf(marker, pos + 1);
      }
    }
  });

  const aiKeywordDensity = wordCount > 0 ? parseFloat((keywordCount / wordCount).toFixed(4)) : 0;

  // 6. Calculate Predictability Score (Heuristic Perplexity)
  let predictabilityScore = 50.0;
  if (wordCount > 5) {
    const burstinessImpact = Math.max(0, 35 - (burstiness * 4.5));
    const diversityImpact = Math.max(0, (1 - lexicalDiversity) * 60);
    const entropyImpact = Math.max(0, (5.8 - entropy) * 15);
    const ngramImpact = Math.max(0, (1.0 - trigramRatio) * 40);

    predictabilityScore = parseFloat(Math.min(100, Math.max(0, 30 + burstinessImpact + diversityImpact + entropyImpact + ngramImpact)).toFixed(2));
  }

  // ==========================================================
  // FINAL SAAS SCORING FORMULA
  // ==========================================================
  let baseScore = 0;
  if (wordCount > 0) {
    baseScore += predictabilityScore * 0.40;
    const burstinessScore = Math.max(0, 100 - (burstiness * 15));
    baseScore += burstinessScore * 0.30;
    const keywordScore = Math.min(100, (keywordWeightedScore / (wordCount || 1)) * 1200);
    baseScore += keywordScore * 0.20;
    const nGramScore = ( (1 - bigramRatio) * 50 + (1 - trigramRatio) * 50 );
    baseScore += nGramScore * 0.10;
  }

  let finalAiProbability = Math.min(100, Math.max(0, Math.round(baseScore)));
  let hybridScanPerformed = false;

  // If Hybrid Mode requested, perform LLM evaluation
  if (options?.hybrid) {
    const llmScore = await queryLLMForDetection(cleanText);
    if (llmScore !== null) {
      // Blends statistical metrics with modern LLM stylist feedback
      finalAiProbability = Math.round(finalAiProbability * 0.4 + llmScore * 0.6);
      hybridScanPerformed = true;
    }
  }

  // Verdict labeling
  let label: 'Human' | 'Mixed' | 'AI' = 'Human';
  if (finalAiProbability > 65) {
    label = 'AI';
  } else if (finalAiProbability > 35) {
    label = 'Mixed';
  }

  // Classifier weights distribution
  let gptProbability = 0;
  let claudeProbability = 0;
  let geminiProbability = 0;
  let llamaProbability = 0;

  if (finalAiProbability > 10) {
    const totalHits = hits.gpt + hits.claude + hits.gemini + hits.llama;
    if (totalHits > 0) {
      gptProbability = Math.round((hits.gpt / totalHits) * finalAiProbability);
      claudeProbability = Math.round((hits.claude / totalHits) * finalAiProbability);
      geminiProbability = Math.round((hits.gemini / totalHits) * finalAiProbability);
      llamaProbability = Math.round((hits.llama / totalHits) * finalAiProbability);
    } else {
      // Default market share distribution fallback
      gptProbability = Math.round(finalAiProbability * 0.45);
      claudeProbability = Math.round(finalAiProbability * 0.25);
      geminiProbability = Math.round(finalAiProbability * 0.20);
      llamaProbability = Math.round(finalAiProbability * 0.10);
    }
  }

  // Sentence-level Highlights
  const sentencesResult = sentenceArray.map(s => {
    const sWords = s.split(/\s+/).filter(Boolean);
    const sWordCount = sWords.length;

    let sScore = 20;
    const distToTypicalLength = Math.abs(sWordCount - 15);
    sScore += Math.max(0, 30 - (distToTypicalLength * 2.0));

    // Check words
    sWords.forEach(w => {
      const cleanW = w.toLowerCase().replace(/[^\w\u00C0-\u00FF]/g, '');
      if (langConfig.markers.includes(cleanW)) {
        sScore += 25;
      }
    });

    const finalSScore = Math.min(100, sScore);

    let highlightRisk: 'low' | 'medium' | 'high' = 'low';
    if (finalSScore >= 70) {
      highlightRisk = 'high';
    } else if (finalSScore >= 38) {
      highlightRisk = 'medium';
    }

    return {
      text: s,
      wordCount: sWordCount,
      aiScore: finalSScore,
      highlightRisk
    };
  });

  return {
    aiProbability: finalAiProbability,
    label,
    language: detectedLang,
    classifiers: {
      gptProbability,
      claudeProbability,
      geminiProbability,
      llamaProbability
    },
    metrics: {
      wordCount,
      sentenceCount,
      lexicalDiversity,
      giraudIndex,
      herdanIndex,
      entropy,
      burstiness,
      predictabilityScore,
      aiKeywordDensity,
      bigramRepetitionRatio: bigramRatio,
      trigramRepetitionRatio: trigramRatio
    },
    sentences: sentencesResult,
    hybridScanPerformed
  };
}
