/**
 * Service to check text for plagiarism against web indices and Wikipedia.
 */

export interface PlagiarismMatch {
  matchedText: string;
  sourceUrl: string;
  sourceTitle: string;
  similarity: number; // 0 to 100
  startIndex: number;
  endIndex: number;
}

export interface PlagiarismResult {
  plagiarismPercent: number; // 0 to 100
  uniquePercent: number; // 0 to 100
  matches: PlagiarismMatch[];
}

/**
 * Calculates Levenshtein distance string similarity percentage.
 */
function getLevenshteinSimilarity(s1: string, s2: string): number {
  let longer = s1.toLowerCase().trim();
  let shorter = s2.toLowerCase().trim();
  if (longer.length < shorter.length) {
    let temp = longer;
    longer = shorter;
    shorter = temp;
  }
  const longerLength = longer.length;
  if (longerLength === 0) {
    return 100;
  }
  const editDistance = levenshteinDistance(longer, shorter);
  return parseFloat(((longerLength - editDistance) / longerLength * 100).toFixed(2));
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

/**
 * Calculates Jaccard token set intersection similarity percentage.
 */
function getJaccardSimilarity(s1: string, s2: string): number {
  const words1 = new Set(s1.toLowerCase().replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean));
  const words2 = new Set(s2.toLowerCase().replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return parseFloat(((intersection.size / union.size) * 100).toFixed(2));
}

/**
 * Calculates Containment Index (percentage of sentence words present in source snippet).
 */
function getContainmentIndex(sentence: string, snippet: string): number {
  const words1 = sentence.toLowerCase().replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean);
  const words2 = new Set(snippet.toLowerCase().replace(/[^\w\s-]/g, '').split(/\s+/).filter(Boolean));

  if (words1.length === 0 || words2.size === 0) return 0;

  let intersectionCount = 0;
  const uniqueWords1 = new Set(words1);

  uniqueWords1.forEach(w => {
    if (words2.has(w)) {
      intersectionCount++;
    }
  });

  return parseFloat(((intersectionCount / uniqueWords1.size) * 100).toFixed(2));
}

/**
 * Blends Levenshtein distance and Jaccard token metrics for high-reliability match detection.
 */
function calculateCombinedSimilarity(s1: string, s2: string): number {
  const lev = getLevenshteinSimilarity(s1, s2);
  const jac = getJaccardSimilarity(s1, s2);
  return parseFloat(((lev * 0.5) + (jac * 0.5)).toFixed(2));
}

// Multilingual stop words list to extract pure search keywords
const COMMON_STOP_WORDS = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'was', 'who', 'is', 'are', 'were',
  'el', 'la', 'los', 'de', 'y', 'en', 'que', 'un', 'una', 'con', 'para', 'se', 'no', 'por', 'lo', 'su', 'al', 'del', 'como',
  'le', 'les', 'et', 'dans', 'pour', 'qui', 'sur', 'avec', 'est', 'du',
  'der', 'die', 'das', 'und', 'ist', 'in', 'zu', 'den', 'von', 'mit', 'es', 'für', 'sich', 'nicht', 'auf',
  'o', 'os', 'em', 'com', 'sua', 'ao', 'da', 'mais',
  'il', 'per', 'si', 'non', 'da', 'su', 'ha'
];

/**
 * Clean search query to extract highly searchable content keywords (preserves hyphens, filters stop words)
 */
function cleanQuery(text: string): string {
  const cleaned = text.replace(/[^\w\s-]/g, '');
  const keywords = cleaned
    .split(/\s+/)
    .filter(w => w && !COMMON_STOP_WORDS.includes(w.toLowerCase()))
    .slice(0, 7) // Keep up to 7 content keywords
    .join(' ');
  return encodeURIComponent(keywords);
}

/**
 * Scrapes DuckDuckGo HTML search endpoint to verify text uniqueness
 */
async function queryDuckDuckGo(sentence: string): Promise<{ url: string; title: string; snippet: string }[]> {
  try {
    const query = cleanQuery(sentence);
    const url = `https://html.duckduckgo.com/html/?q="${query}"`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const results: { url: string; title: string; snippet: string }[] = [];

    const resultBlockRegex = /<div class="result__body">([\s\S]*?)<\/div>/g;
    let match;

    while ((match = resultBlockRegex.exec(html)) !== null && results.length < 3) {
      const block = match[1];

      const urlMatch = block.match(/href="([^"]+?)"/);
      const titleMatch = block.match(/class="result__snippet"[^>]*?>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/class="result__snippet"[^>]*?>([\s\S]*?)<\/a>/);
      const nameMatch = block.match(/class="result__a"[^>]*?>([\s\S]*?)<\/a>/);

      if (urlMatch && (snippetMatch || nameMatch)) {
        const decodedUrl = decodeURIComponent(urlMatch[1].replace(/.*\?uddg=/, '').split('&')[0]);
        const snippetText = (snippetMatch ? snippetMatch[1] : '').replace(/<[^>]*?>/g, '').trim();
        const titleText = (nameMatch ? nameMatch[1] : '').replace(/<[^>]*?>/g, '').trim();

        results.push({
          url: decodedUrl,
          title: titleText || 'Web Result',
          snippet: snippetText
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[DuckDuckGo Search] Engine query failed:', err);
    return [];
  }
}

/**
 * Fallback fact index scanner querying the free open Wikipedia Search API
 */
async function queryWikipedia(sentence: string): Promise<{ url: string; title: string; snippet: string }[]> {
  try {
    const query = cleanQuery(sentence);
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&origin=*`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = (await response.json()) as any;
    const searchResults = data.query?.search || [];

    return searchResults.slice(0, 3).map((item: any) => ({
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      title: item.title,
      snippet: item.snippet.replace(/<span class="searchmatch">/g, '').replace(/<\/span>/g, '').trim()
    }));
  } catch (err) {
    console.error('[Wikipedia Search] query failed:', err);
    return [];
  }
}

/**
 * Aggregates web search queries utilizing DDG with a Wikipedia fact index fallback
 */
async function querySearchEngines(sentence: string): Promise<{ url: string; title: string; snippet: string }[]> {
  let results = await queryDuckDuckGo(sentence);

  // Fallback to Wikipedia API if DuckDuckGo is blocked or returns zero matches
  if (results.length === 0) {
    results = await queryWikipedia(sentence);
  }

  return results;
}

/**
 * Scans text and compares sentences against search results.
 */
export async function checkPlagiarism(text: string): Promise<PlagiarismResult> {
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).filter(Boolean).length > 6); // Only check sentences longer than 6 words

  if (sentences.length === 0) {
    return { plagiarismPercent: 0, uniquePercent: 100, matches: [] };
  }

  // Check a maximum of 5 sentences to keep response times fast and avoid search engine rate blocks
  const targetSentences = sentences.slice(0, 5);
  const matches: PlagiarismMatch[] = [];
  let plagiarizedCount = 0;

  for (const sentence of targetSentences) {
    const searchResults = await querySearchEngines(sentence);

    for (const res of searchResults) {
      const combinedSim = calculateCombinedSimilarity(sentence, res.snippet);
      const containmentSim = getContainmentIndex(sentence, res.snippet);
      
      // Select the best similarity measure (combined string diff or key-word containment index)
      const similarity = Math.max(combinedSim, containmentSim);

      // If similarity is greater than 55%, flag as plagiarized
      if (similarity > 55) {
        // Find exact start and end characters index offset in the full text
        const startIndex = text.indexOf(sentence);
        const endIndex = startIndex !== -1 ? startIndex + sentence.length : -1;

        matches.push({
          matchedText: sentence,
          sourceUrl: res.url,
          sourceTitle: res.title,
          similarity,
          startIndex,
          endIndex
        });
        plagiarizedCount++;
        break; // Stop checking other search results for this sentence
      }
    }
  }

  const plagiarismPercent = Math.round((plagiarizedCount / targetSentences.length) * 100);
  const uniquePercent = 100 - plagiarismPercent;

  return {
    plagiarismPercent,
    uniquePercent,
    matches
  };
}
