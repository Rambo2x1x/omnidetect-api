/**
 * Service to check text for plagiarism against search engine index records.
 */

interface PlagiarismMatch {
  matchedText: string;
  sourceUrl: string;
  sourceTitle: string;
  similarity: number; // 0 to 100
}

interface PlagiarismResult {
  plagiarismPercent: number; // 0 to 100
  uniquePercent: number; // 0 to 100
  matches: PlagiarismMatch[];
}

/**
 * Calculates Levenshtein distance string similarity percentage.
 */
function getSimilarity(s1: string, s2: string): number {
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
 * Clean search query to bypass blocks
 */
function cleanQuery(text: string): string {
  return encodeURIComponent(
    text
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .slice(0, 10) // Limit query to first 10 words to prevent search string truncation
      .join(' ')
  );
}

/**
 * Scrapes DuckDuckGo HTML search endpoint to verify text uniqueness
 */
async function querySearchEngine(sentence: string): Promise<{ url: string; title: string; snippet: string }[]> {
  try {
    const query = cleanQuery(sentence);
    const url = `https://html.duckduckgo.com/html/?q="${query}"`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const results: { url: string; title: string; snippet: string }[] = [];

    // Parse DuckDuckGo search result matches using regex
    // DuckDuckGo structure:
    // <a class="result__url" href="URL">
    // <a class="result__snippet" ...>Snippet</a>
    const resultBlockRegex = /<div class="result__body">([\s\S]*?)<\/div>/g;
    let match;

    while ((match = resultBlockRegex.exec(html)) !== null && results.length < 3) {
      const block = match[1];
      
      const urlMatch = block.match(/href="([^"]+?)"/);
      const titleMatch = block.match(/class="result__snippet"[^>]*?>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/class="result__snippet"[^>]*?>([\s\S]*?)<\/a>/); // Fallback: extract same block text
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
    console.error('[Plagiarism Search] Engine query failed:', err);
    return [];
  }
}

/**
 * Scans text and compares sentences against search results.
 */
export async function checkPlagiarism(text: string): Promise<PlagiarismResult> {
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).filter(Boolean).length > 6); // Only check sentences longer than 6 words to avoid common short phrases

  if (sentences.length === 0) {
    return { plagiarismPercent: 0, uniquePercent: 100, matches: [] };
  }

  // We limit check to a maximum of 5 sentences to keep response times fast and avoid search engine rate blocks
  const targetSentences = sentences.slice(0, 5);
  const matches: PlagiarismMatch[] = [];
  let plagiarizedCount = 0;

  for (const sentence of targetSentences) {
    const searchResults = await querySearchEngine(sentence);
    
    for (const res of searchResults) {
      const similarity = getSimilarity(sentence, res.snippet);
      
      // If similarity is greater than 60%, flag as duplicate match
      if (similarity > 60) {
        matches.push({
          matchedText: sentence,
          sourceUrl: res.url,
          sourceTitle: res.title,
          similarity
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
