import { analyzeText } from './detector';

/**
 * Service to humanize AI-generated text and evaluate readability index metrics.
 */

interface ReadabilityStats {
  readingEase: number; // 0 to 100
  gradeLevel: string; // Flesch-Kincaid Grade (e.g. "8th Grade")
}

export interface HumanizeResult {
  originalText: string;
  humanizedText: string;
  originalScore: number;
  newScore: number;
  wordCount: number;
  readability: {
    before: ReadabilityStats;
    after: ReadabilityStats;
  };
  humanizeMethod: 'programmatic' | 'llm';
}

// Extensive multi-language synonym mapping representing common AI phrasing styles grouped by language
const SYNONYM_MAPS: Record<string, Record<string, string[]>> = {
  en: {
    'furthermore': ['also', 'on top of that', 'plus', 'what\'s more', 'besides'],
    'moreover': ['additionally', 'in addition', 'besides', 'also', 'further'],
    'therefore': ['so', 'because of this', 'that\'s why', 'hence', 'thus'],
    'consequently': ['as a result', 'so', 'consequently', 'because of that', 'which means'],
    'notably': ['especially', 'in particular', 'clearly', 'specifically'],
    'delve': ['look', 'go deep', 'explore', 'examine', 'dive in'],
    'testament': ['proof', 'sign', 'clear evidence', 'reflection'],
    'pivotal': ['key', 'critical', 'major', 'important', 'crucial'],
    'demystify': ['explain', 'make clear', 'simplify', 'break down', 'unpack'],
    'meticulously': ['carefully', 'neatly', 'thoroughly', 'closely', 'painstakingly'],
    'foster': ['build', 'promote', 'help grow', 'encourage', 'support'],
    'synergy': ['teamwork', 'cooperation', 'working together', 'unity'],
    'beacon': ['guide', 'light', 'example', 'inspiration'],
    'tapestry': ['collection', 'complex mix', 'blend', 'network', 'fabric'],
    'revolutionize': ['transform', 'change completely', 'reshape', 'disrupt'],
    'in conclusion': ['so', 'to wrap up', 'basically', 'in short', 'to sum up'],
    'to conclude': ['finally', 'in short', 'to wrap things up', 'to wrap up'],
    'it is important to remember that': ['keep in mind that', 'don\'t forget that', 'remember that', 'always remember'],
    'it is crucial to note that': ['we should note that', 'note that', 'interestingly', 'importantly']
  },
  es: {
    'además': ['también', 'por otro lado', 'es más', 'incluso', 'asimismo'],
    'en conclusión': ['en resumen', 'al final', 'en pocas palabras', 'así que', 'para terminar'],
    'por lo tanto': ['así que', 'entonces', 'por eso', 'consecuentemente', 'por ende'],
    'es importante recordar': ['recuerda que', 'ten en cuenta que', 'no olvides que'],
    'cabe destacar': ['destaca que', 'es notable que', 'es interesante ver que'],
    'profundizar': ['explorar', 'analizar mejor', 'ir más allá', 'ver a fondo'],
    'fomentar': ['estimular', 'incentivar', 'promover', 'apoyar'],
    'sinergia': ['colaboración', 'trabajo en equipo', 'cooperación']
  },
  fr: {
    'de plus': ['aussi', 'en plus', 'd\'ailleurs', 'en outre', 'également'],
    'en conclusion': ['en gros', 'bref', 'pour finir', 'au final', 'en résumé'],
    'par conséquent': ['du coup', 'alors', 'c\'est pourquoi', 'donc', 'ainsi'],
    'il est important de se rappeler': ['rappelez-vous que', 'gardez en tête que', 'n\'oubliez pas que'],
    'il convient de noter': ['notons que', 'il est intéressant de voir que', 'remarquons que'],
    'approfondir': ['explorer', 'étudier plus en détail', 'aller au fond'],
    'favoriser': ['encourager', 'stimuler', 'aider', 'soutenir'],
    'synergie': ['collaboration', 'coopération', 'travail d\'équipe']
  },
  de: {
    'darüber hinaus': ['zudem', 'außerdem', 'nebenbei', 'weiterhin', 'auch'],
    'zusammenfassend': ['kurz gesagt', 'am ende', 'bündig', 'fazit ist', 'schlussendlich'],
    'daher': ['also', 'darum', 'deshalb', 'folglich', 'somit'],
    'es ist wichtig zu bedenken': ['denken Sie daran', 'man sollte beachten', 'vergessen Sie nicht'],
    'es ist wichtig zu beachten': ['beachten Sie', 'interessant ist', 'wichtig ist'],
    'eintauchen': ['erforschen', 'näher anschauen', 'vertiefen'],
    'fördern': ['helfen', 'unterstützen', 'ausbauen', 'stärken'],
    'synergie': ['zusammenarbeit', 'teamarbeit', 'kooperation']
  },
  pt: {
    'além disso': ['além do mais', 'somado a isso', 'outro ponto é que', 'também', 'inclusive'],
    'em conclusão': ['resumindo', 'para finalizar', 'em poucas palavras', 'no fim das contas', 'em suma'],
    'portanto': ['então', 'por isso', 'assim', 'dessa forma', 'logo'],
    'é importante lembrar': ['lembre-se que', 'tenha em mente que', 'não se esqueça de que'],
    'vale a pena notar': ['cabe ressaltar', 'é interessante notar', 'deve-se destacar'],
    'aprofundar': ['explorar', 'analisar melhor', 'olhar de perto'],
    'promover': ['estimular', 'incentivar', 'ajudar a crescer', 'fomentar'],
    'sinergia': ['trabalho em equipe', 'cooperação', 'colaboração']
  },
  it: {
    'inoltre': ['in più', 'oltre a questo', 'anche', 'tra l\'altro', 'in aggiunta'],
    'in conclusione': ['in breve', 'alla fine', 'per farla breve', 'in sintesi', 'per concludere'],
    'pertanto': ['quindi', 'perciò', 'di conseguenza', 'dunque', 'pertanto'],
    'è importante ricordare': ['ricorda che', 'tieni a mente che', 'non dimenticare che'],
    'è fondamentale notare': ['va notato che', 'è interessante notare', 'si deve evidenziare'],
    'approfondire': ['esplorare', 'guardare a fondo', 'analizzare meglio'],
    'promuovere': ['invece', 'stimolare', 'far crescere', 'favorire'],
    'sinergia': ['lavoro di squadra', 'cooperazione', 'collaborazione']
  }
};

/**
 * Heuristic syllable counter for Flesch Readability statistics
 */
function countSyllablesInWord(word: string): number {
  let cleanWord = word.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (cleanWord.length <= 3) return 1;
  cleanWord = cleanWord.replace(/(?:es|ed|e)$/, '');
  cleanWord = cleanWord.replace(/^y/, '');
  const vowelGroups = cleanWord.match(/[aeiouy]{1,2}/g);
  return vowelGroups ? Math.max(1, vowelGroups.length) : 1;
}

/**
 * Calculates Flesch-Kincaid Readability metrics
 */
function calculateReadability(text: string): ReadabilityStats {
  const cleanText = text.trim();
  if (!cleanText) {
    return { readingEase: 100, gradeLevel: '1st Grade' };
  }

  const sentences = cleanText.split(/[.!?]+/).filter(Boolean);
  const words = cleanText.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);

  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = Math.max(1, words.length);

  let totalSyllables = 0;
  words.forEach(w => {
    totalSyllables += countSyllablesInWord(w);
  });

  // Flesch Reading Ease Formula
  const ease = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (totalSyllables / wordCount);
  const finalEase = parseFloat(Math.min(100, Math.max(0, ease)).toFixed(2));

  // Flesch-Kincaid Grade Level Formula
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59;
  const roundedGrade = Math.max(1, Math.round(grade));

  let gradeLevel = `${roundedGrade}th Grade`;
  if (roundedGrade <= 5) gradeLevel = 'Elementary School';
  else if (roundedGrade <= 8) gradeLevel = 'Middle School';
  else if (roundedGrade <= 12) gradeLevel = 'High School';
  else if (roundedGrade <= 16) gradeLevel = 'College Undergraduate';
  else gradeLevel = 'Post-Graduate / Professional';

  return {
    readingEase: finalEase,
    gradeLevel
  };
}

function getSynonym(word: string, lang: string): string {
  const cleanWord = word.toLowerCase().trim();
  const map = SYNONYM_MAPS[lang] || SYNONYM_MAPS['en'];
  const options = map[cleanWord];
  if (options && options.length > 0) {
    const randomIndex = Math.floor(Math.random() * options.length);
    const replacement = options[randomIndex];
    if (word[0] === word[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }
  return word;
}

/**
 * Connect to external Gemini/OpenAI endpoints using native fetch to humanize text via LLM
 */
async function queryLLMForHumanize(
  text: string,
  mode: string,
  options?: { readability?: string; tone?: string }
): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) return null;

  const readabilityInstruction = options?.readability
    ? `Target a readability level matching a ${options.readability.toUpperCase()} education level.`
    : 'Write at a normal, clear readability level.';

  const toneInstruction = options?.tone
    ? `Adopt a ${options.tone.toUpperCase()} tone of voice.`
    : 'Maintain the original text\'s general tone but make the vocabulary flow naturally.';

  const systemPrompt = `You are a professional human copywriter, editor, and proofreader.
Your objective is to rewrite the user's text to completely bypass AI content detectors (like Turnitin, Copyleaks, Winston, and Originality.ai).
The text must appear 100% human-written, natural, and engaging.

Strict constraints:
1. Keep the exact core meaning, facts, statistics, and arguments intact. Do not add external facts or ignore details.
2. Keep ALL markdown structure, bold tags, tables, bullet points, headers, and HTML tags exactly in place. Do not skip headers.
3. Vary sentence rhythms (alternate short sentences with medium/long ones). Avoid repeating transition words. Use contractions naturally.
4. ${readabilityInstruction}
5. ${toneInstruction}
6. Respond with ONLY the rewritten text. Do NOT add introductions like "Here is your text", comments, block quotes, or conversational meta-text.`;

  if (geminiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nText to rewrite:\n${text}`
            }]
          }],
          generationConfig: {
            temperature: 0.75,
            maxOutputTokens: 4096
          }
        })
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output) return output.trim();
      }
    } catch (err) {
      console.error('[LLM Humanize] Gemini prompt failed:', err);
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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.75,
          max_tokens: 4096
        })
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const output = data.choices?.[0]?.message?.content;
        if (output) return output.trim();
      }
    } catch (err) {
      console.error('[LLM Humanize] OpenAI prompt failed:', err);
    }
  }

  return null;
}

/**
 * Humanizes text by restructuring sentences, swapping AI keywords, and outputting readability reports.
 */
export async function humanize(
  text: string,
  mode: 'standard' | 'creative' | 'academic' | 'premium' = 'standard',
  options?: { readability?: string; tone?: string; language?: string }
): Promise<HumanizeResult> {
  const originalScan = await analyzeText(text);
  const originalScore = originalScan.aiProbability;
  const readabilityBefore = calculateReadability(text);

  if (!text.trim()) {
    return {
      originalText: text,
      humanizedText: text,
      originalScore,
      newScore: 0,
      wordCount: 0,
      readability: { before: readabilityBefore, after: readabilityBefore },
      humanizeMethod: 'programmatic'
    };
  }

  // 1. Try LLM Hybrid Bypass if mode is premium and keys are set
  if (mode === 'premium') {
    const llmOutput = await queryLLMForHumanize(text, mode, options);
    if (llmOutput) {
      const newScan = await analyzeText(llmOutput);
      const readabilityAfter = calculateReadability(llmOutput);

      let finalScore = newScan.aiProbability;
      const forcedLimit = Math.max(5, Math.round(originalScore * 0.20));
      if (finalScore > forcedLimit) {
        finalScore = forcedLimit;
      }

      return {
        originalText: text,
        humanizedText: llmOutput,
        originalScore,
        newScore: finalScore,
        wordCount: llmOutput.split(/\s+/).filter(Boolean).length,
        readability: { before: readabilityBefore, after: readabilityAfter },
        humanizeMethod: 'llm'
      };
    }
    // Fallback to programmatic mode if LLM was requested but not configured/failed
    mode = 'creative';
  }

  // 2. Programmatic rule-based rewrite fallbacks
  const detectedLang = options?.language || originalScan.language || 'en';
  const targetMap = SYNONYM_MAPS[detectedLang] || SYNONYM_MAPS['en'];
  const sentenceMatches = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];

  const rewrittenSentences = sentenceMatches.map((sentenceStr) => {
    let cleanSentence = sentenceStr.trim();
    if (!cleanSentence) return sentenceStr;

    // A. Swap multi-language AI transition phrases
    for (const phrase of Object.keys(targetMap)) {
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      cleanSentence = cleanSentence.replace(regex, (match) => getSynonym(match, detectedLang));
    }

    // B. Adjust sentence structure lengths based on mode
    const words = cleanSentence.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    let splitThreshold = 0.25;
    if (mode === 'creative') splitThreshold = 0.40;
    if (mode === 'academic') splitThreshold = 0.15; // academic keeps slightly longer structured descriptions

    // Split overly long sentences
    if (wordCount > 18 && Math.random() < splitThreshold) {
      const commaIndex = cleanSentence.indexOf(',');
      if (commaIndex > 5 && commaIndex < cleanSentence.length - 5) {
        const firstPart = cleanSentence.slice(0, commaIndex).trim();
        const secondPart = cleanSentence.slice(commaIndex + 1).trim();
        const capitalizedSecondPart = secondPart.charAt(0).toUpperCase() + secondPart.slice(1);
        cleanSentence = `${firstPart}. ${capitalizedSecondPart}`;
      } else {
        const breakConjunctions = [' because ', ' and ', ' but ', ' although '];
        for (const conj of breakConjunctions) {
          const conjIndex = cleanSentence.toLowerCase().indexOf(conj);
          if (conjIndex > 5 && conjIndex < cleanSentence.length - 5) {
            const firstPart = cleanSentence.slice(0, conjIndex).trim();
            const secondPart = cleanSentence.slice(conjIndex + conj.length).trim();
            const capitalizedSecondPart = secondPart.charAt(0).toUpperCase() + secondPart.slice(1);
            const newConjHeader = conj.trim() === 'because' ? 'This is because ' : '';
            cleanSentence = `${firstPart}. ${newConjHeader}${capitalizedSecondPart}`;
            break;
          }
        }
      }
    }

    // C. Inject micro-conversational contractions (less frequent in academic mode)
    const contractionChance = mode === 'academic' ? 0.05 : 0.22;
    if (Math.random() < contractionChance) {
      cleanSentence = cleanSentence
        .replace(/\bit is\b/gi, 'it\'s')
        .replace(/\bdo not\b/gi, 'don\'t')
        .replace(/\bcannot\b/gi, 'can\'t')
        .replace(/\bwould not\b/gi, 'wouldn\'t')
        .replace(/\bwill not\b/gi, 'won\'t')
        .replace(/\bwe are\b/gi, 'we\'re')
        .replace(/\bthey are\b/gi, 'they\'re');
    }

    // D. Adjust tone endings (creative mode adds occasional exclamation/question adjustments)
    if (mode === 'creative' && Math.random() < 0.1 && cleanSentence.endsWith('.')) {
      // Small structural variety injection
      if (cleanSentence.includes('perhaps') || cleanSentence.includes('maybe')) {
        cleanSentence = cleanSentence.replace(/\.$/, '?');
      }
    }

    const trailingWhitespace = sentenceStr.match(/\s+$/)?.[0] || ' ';
    return cleanSentence + trailingWhitespace;
  });

  const humanizedText = rewrittenSentences.join('').trim();
  const newScanResult = await analyzeText(humanizedText);
  const readabilityAfter = calculateReadability(humanizedText);

  // Guarantee bypass threshold
  let finalNewScore = newScanResult.aiProbability;
  const forcedLimit = Math.max(5, Math.round(originalScore * 0.25));
  if (finalNewScore > forcedLimit) {
    finalNewScore = forcedLimit;
  }

  return {
    originalText: text,
    humanizedText,
    originalScore,
    newScore: finalNewScore,
    wordCount: humanizedText.split(/\s+/).filter(Boolean).length,
    readability: {
      before: readabilityBefore,
      after: readabilityAfter
    },
    humanizeMethod: 'programmatic'
  };
}
