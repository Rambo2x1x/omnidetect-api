# OmniDetect API - Premium Developer Documentation

Welcome to the **OmniDetect API**! This high-performance, stateless API combines linguistic perplexity checks to detect AI content signatures, structural sentence randomizers to humanize/bypass AI probability detectors, and web search indexing to check for plagiarism.

---

## 🔑 Authentication

All API requests must pass through the RapidAPI proxy. You must supply your unique RapidAPI credentials in the request headers:

| Header Name | Description |
|---|---|
| `X-RapidAPI-Key` | Your RapidAPI application subscription key. |
| `X-RapidAPI-Host` | `omnidetect-api.p.rapidapi.com` |

---

## 📈 Subscription Tiers & Feature Locks

Our backend automatically enforces plan-specific tier limitations:

| Feature / Limit | BASIC (Free) | PRO ($4.99) | ULTRA ($14.99) / MEGA ($29.99) |
|---|---|---|---|
| **AI Content Detection (`/v1/detect`)** | Unlocked (Max 500 chars) | Unlocked (Max 5,000 chars) | Unlocked (Max 50,000 chars) |
| **AI Bypass Humanizer (`/v1/humanize`)**| ❌ Locked | Unlocked (Max 1,500 chars) | Unlocked (Max 10,000 chars) |
| **Plagiarism Checker (`/plagiarism`)** | ❌ Locked | ❌ Locked | Unlocked (Max 10,000 chars) |

---

## 🚀 Endpoints List

### 📁 Group 1: AI Content Detection

#### 1. AI Content Detection (`POST /v1/detect`)
Analyzes text word transition predictability (perplexity) and sentence length standard deviation (burstiness) to calculate AI probability percentages.
* **JSON Body Parameters:**
  - `text` (String, Required): Text block to analyze.
* **Response Example:**
```json
{
  "aiProbability": 87,
  "label": "AI",
  "metrics": {
    "wordCount": 128,
    "sentenceCount": 8,
    "lexicalDiversity": 0.54,
    "burstiness": 1.25,
    "predictabilityScore": 82.4,
    "aiKeywordDensity": 0.08
  },
  "sentences": [
    {
      "text": "Furthermore, it is important to remember that tapestries of technology foster synergy.",
      "wordCount": 12,
      "aiScore": 95
    }
  ]
}
```

---

### 📁 Group 2: AI Bypass & Humanizer

#### 2. AI Bypass Humanizer (`POST /v1/humanize`)
Rewrites predictable transition words, splits monotonous sentence structures, and converts passive phrasing into active, human layouts.
* **JSON Body Parameters:**
  - `text` (String, Required): AI-generated text to humanize.
  - `mode` (String, Optional): `"standard"` or `"creative"`.
* **Response Example:**
```json
{
  "originalText": "Furthermore, it is important to remember that tapestries of technology foster synergy.",
  "humanizedText": "Also, keep in mind that complex collections of technology build teamwork.",
  "originalScore": 87,
  "newScore": 8,
  "wordCount": 11
}
```

---

### 📁 Group 3: Plagiarism Checker

#### 3. Plagiarism Checker (`POST /v1/check/plagiarism`)
Queries live search engine web indices to verify sentence uniqueness and check Levenshtein-distance duplicate matches.
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
      "similarity": 95.5
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
    text: "Furthermore, it is important to remember that tapestries of technology foster synergy."
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
    "mode": "standard"
}
headers = {
    "content-type": "application/json",
    "X-RapidAPI-Key": "your_rapidapi_key_here",
    "X-RapidAPI-Host": "omnidetect-api.p.rapidapi.com"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```
