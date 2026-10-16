/**
 * Web pages a Web-Enhanced suggestion was checked against: only pages the
 * web search itself returned, only http(s), at most 3 per gift, the title
 * trimmed and the host taken from the URL (never from page text). No price,
 * availability or rating is kept from the web.
 */
const MAX_WEB_SOURCES = 3;
const MAX_TITLE_LENGTH = 120;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// One entity decoded, once ("&amp;amp;" stays "&amp;"); numeric ones too
const decodeEntity = (entity, name) => {
  if (name[0] !== '#') return ENTITIES[name.toLowerCase()];
  const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
};

// A URL in one canonical form (no #fragment), or null unless http(s)
const normalizeUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  return url.href;
};

// Search titles come with markup ("<strong>Bike</strong>"): plain text only
const plainTitle = (title) => String(title || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, decodeEntity)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_TITLE_LENGTH);

const toWebSource = (result) => {
  const url = normalizeUrl(result && result.url);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  return { title: plainTitle(result.title) || host, url, host };
};

// Words too common in gift names to show that a page is about this gift
const GENERIC_WORDS = new Set([
  'book', 'books', 'kit', 'set', 'gift', 'gifts', 'custom', 'personalized',
  'collection', 'edition', 'deluxe', 'premium', 'bundle', 'experience', 'guide'
]);

// Lowercase words of letters only ("Sci-Fi" is "sci" and "fi")
const letterWords = (text) => String(text || '').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

// The words of a suggestion name that can show a page is about it: 5+
// letters and not generic
const distinctiveWords = (name) => [...new Set(letterWords(name))]
  .filter((word) => word.length >= 5 && !GENERIC_WORDS.has(word));

/**
 * A search result is about the suggestion when its title or description has
 * at least min(2, N) of the name's N distinctive words, each as a whole word
 * (a simple plural "s" either way allowed; hyphenated words count as their
 * parts). One shared word ("gloves") is not enough when the name has more.
 */
const isAboutSuggestion = (result, suggestionName) => {
  const wanted = distinctiveWords(suggestionName);
  if (wanted.length === 0) return false;
  const found = new Set(letterWords(`${result?.title || ''} ${result?.description || ''}`));
  const has = (word) => found.has(word) || found.has(`${word}s`) || (word.endsWith('s') && found.has(word.slice(0, -1)));
  return wanted.filter(has).length >= Math.min(2, wanted.length);
};

/**
 * Web sources from search results, kept only when their URL is among the
 * URLs the search returned in this generation (`allowed`, normalized).
 */
const buildWebSources = (results, allowed) => {
  const seen = new Set();
  const sources = [];
  for (const result of results || []) {
    const source = toWebSource(result);
    if (!source || seen.has(source.url)) continue;
    if (allowed && !allowed.has(source.url)) continue;
    seen.add(source.url);
    sources.push(source);
    if (sources.length >= MAX_WEB_SOURCES) break;
  }
  return sources;
};

module.exports = { normalizeUrl, buildWebSources, isAboutSuggestion, distinctiveWords, MAX_WEB_SOURCES };
