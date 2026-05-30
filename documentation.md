# OmniDetect API - Premium Developer Documentation (v1.1.0)

Welcome to the **OmniDetect API**! This enterprise-grade, high-performance, stateless API combines advanced statistical text analysis with optional LLM hybrid verification to detect AI content signatures, humanize text to bypass detectors, and scan for plagiarism across live search indices and fact databases.

---

## 🔑 Authentication

All API requests must pass through the RapidAPI proxy or use direct SaaS client API keys:

### 1. RapidAPI Gateway Flow
Supply your credentials in the request headers:

| Header Name | Description |
|---|---|
| `X-RapidAPI-Key` | Your RapidAPI application subscription key. |
| `X-RapidAPI-Host` | `omnidetect-api.p.rapidapi.com` |

### 2. Direct B2B SaaS Keys Flow
Supply your generated API key in the headers:

| Header Name | Description |
|---|---|
| `X-API-Key` | Your direct developer API key (prefixed with `od_`). |

---

## 📈 Subscription Tiers & Feature Locks

Our backend enforces plan-specific tier limitations across endpoints:

| Feature / Limit | BASIC (Free) | PRO ($4.99) | ULTRA ($14.99) / MEGA ($29.99) |
|---|---|---|---|
| **AI Content Detection (`/v1/detect`)** | Unlocked (Max 500 chars) | Unlocked (Max 5,000 chars) | Unlocked (Max 50,000 chars) |
| **AI Bypass Humanizer (`/v1/humanize`)**| ❌ Locked | Unlocked (Max 1,500 chars) | Unlocked (Max 10,000 chars) |
| **Plagiarism Checker (`/plagiarism`)** | ❌ Locked | ❌ Locked | Unlocked (Max 10,000 chars) |

---

## 🚀 Endpoints List

### 📁 Group 1: AI Content Detection

#### 1. AI Content Detection (`POST /v1/detect`)
Analyzes text token patterns, sentence length standard deviation (burstiness), vocabulary richness, N-gram repetitions, and Shannon entropy. Supports six languages (English, Spanish, French, German, Portuguese, Italian) and optional LLM-assisted style co-scans.
* **JSON Body Parameters:**
  - `text` (String, Required): Text block to analyze (up to 50,000 characters).
  - `hybrid` (Boolean, Optional): Toggle LLM-assisted stylistic verification (blends heuristics with LLM insights; requires server `GEMINI_API_KEY` / `OPENAI_API_KEY`). Defaults to `false`.
* **Response Example:**
```json
{
  "aiProbability": 87,
  "label": "AI",
  "language": "en",
  "classifiers": {
    "gptProbability": 45,
    "claudeProbability": 25,
    "geminiProbability": 12,
    "llamaProbability": 5
  },
  "metrics": {
    "wordCount": 128,
    "sentenceCount": 8,
    "lexicalDiversity": 0.54,
    "giraudIndex": 6.11,
    "herdanIndex": 0.88,
    "entropy": 5.12,
    "burstiness": 1.25,
    "predictabilityScore": 82.4,
    "aiKeywordDensity": 0.08,
    "bigramRepetitionRatio": 0.95,
    "trigramRepetitionRatio": 0.98
  },
  "sentences": [
    {
      "text": "Furthermore, it is important to remember that tapestries of technology foster synergy.",
      "wordCount": 12,
      "aiScore": 95,
      "highlightRisk": "high"
    }
  ],
  "hybridScanPerformed": false
}
```

---

### 📁 Group 2: AI Bypass & Humanizer

#### 2. AI Bypass Humanizer (`POST /v1/humanize`)
Rewrites predictable transition words, splits monotonous sentence structures, adjusts punctuation rhythm, and converts passive phrasing into active, human layouts.
* **JSON Body Parameters:**
  - `text` (String, Required): AI-generated text to humanize.
  - `mode` (String, Optional): `"standard"`, `"creative"`, `"academic"`, or `"premium"`.
    - `"standard"`: Safe synonym swap and sentence splitting.
    - `"creative"`: Randomized syntax rhythm rephrase, contractions, and high vocabulary variety.
    - `"academic"`: Preserves formal terminology and academic styling while shifting phrasing flow.
    - `"premium"`: Uses LLM-assisted rephrasing (requires server `GEMINI_API_KEY` / `OPENAI_API_KEY`). Falls back to `"creative"` if not configured.
  - `readability` (String, Optional - Premium Mode Only): `"elementary"`, `"high_school"`, `"college"`, or `"professional"`.
  - `tone` (String, Optional - Premium Mode Only): `"casual"`, `"academic"`, `"creative"`, or `"technical"`.
* **Response Example:**
```json
{
  "originalText": "Furthermore, it is important to remember that tapestries of technology foster synergy.",
  "humanizedText": "Also, keep in mind that complex collections of technology build teamwork.",
  "originalScore": 87,
  "newScore": 8,
  "wordCount": 11,
  "readability": {
    "before": {
      "readingEase": 45.5,
      "gradeLevel": "High School"
    },
    "after": {
      "readingEase": 75.2,
      "gradeLevel": "Middle School"
    }
  },
  "humanizeMethod": "programmatic"
}
```

---

### 📁 Group 3: Plagiarism Checker

#### 3. Plagiarism Checker (`POST /v1/check/plagiarism`)
Compares text sentence-by-sentence against live search engine web indices (DuckDuckGo) and Wikipedia databases using a blended similarity model (Levenshtein distance + Jaccard token metrics). Returns match start/end character offsets.
* **JSON Body Parameters:**
  - `text` (String, Required): Copy text to verify.
* **Response Example:**
```json
{
  "plagiarismPercent": 20,
  "uniquePercent": 80,
  "matches": [
    {
      "matchedText": "Cat is a small domesticated carnivorous mammal.",
      "sourceUrl": "https://en.wikipedia.org/wiki/Cat",
      "sourceTitle": "Cat - Wikipedia",
      "similarity": 95.5,
      "startIndex": 0,
      "endIndex": 46
    }
  ]
}
```

---

## 💻 Code Integration Snippets (RapidAPI Sandbox)

### 1. JavaScript (Fetch API - AI Content Detection)
```javascript
const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-RapidAPI-Key': 'your_rapidapi_key_here',
    'X-RapidAPI-Host': 'omnidetect-api.p.rapidapi.com'
  },
  body: JSON.stringify({
    text: "Furthermore, it is important to remember that tapestries of technology foster synergy.",
    hybrid: true
  })
};

fetch('https://omnidetect-api.p.rapidapi.com/v1/detect', options)
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
```

### 2. Python (Requests - AI Bypass Humanizer)
```python
import requests

url = "https://omnidetect-api.p.rapidapi.com/v1/humanize"

payload = {
    "text": "Furthermore, it is important to remember that tapestries of technology foster synergy.",
    "mode": "premium",
    "tone": "creative",
    "readability": "high_school"
}
headers = {
    "content-type": "application/json",
    "X-RapidAPI-Key": "your_rapidapi_key_here",
    "X-RapidAPI-Host": "omnidetect-api.p.rapidapi.com"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```
