/**
 * Safely extract a JSON object from a string that may contain
 * surrounding text (markdown fences, prose preamble, trailing notes).
 * LLM responses frequently wrap JSON this way even when asked not to.
 *
 * Strategy: try a direct parse first; otherwise scan from the first
 * '{' with a string-aware depth counter to find the matching '}' and
 * parse that slice. Returns null when no parseable object is found.
 *
 * @param {String} str - String potentially containing JSON
 * @param {String} [label] - Log prefix identifying the caller
 * @returns {Object|null} Parsed JSON object or null if not found
 */
const logger = require('../utils/logger');
function safeExtractJson(str, label = 'safeJson') {
  if (typeof str !== 'string') return str;

  try {
    return JSON.parse(str);
  } catch (e) {
    // Continue to extraction methods
  }

  const startIdx = str.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = str.substring(startIdx, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            logger.warn(`[${label}] Found JSON-like structure but failed to parse:`, e.message);
            return null;
          }
        }
      }
    }
  }

  return null;
}

module.exports = { safeExtractJson };
