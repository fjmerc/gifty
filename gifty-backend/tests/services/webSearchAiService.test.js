// Web-Enhanced mode reports honestly how the web search went: per
// suggestion, and in total, so the page can warn when no search worked.
// Brave allows one request per second, measured by us from when the
// previous request *finished*. Raw rate-limit headers (plan, quota) never
// leave the service. AI service, models and HTTP are stubbed.
jest.mock('axios');
jest.mock('../../services/enhancedAiService');
jest.mock('../../models/Recipient');
jest.mock('../../models/Event');
jest.mock('../../models/SuggestionHistory');
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const axios = require('axios');
const enhancedAiService = require('../../services/enhancedAiService');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const SuggestionHistory = require('../../models/SuggestionHistory');
const { getWebEnhancedGiftSuggestions } = require('../../services/webSearchAiService');

jest.setTimeout(15000);

const idea = (name) => ({ name, description: `${name}!`, category: 'Sports', tags: ['bike'], estimatedPrice: 30, priceRange: { min: 25, max: 35 } });
const braveOk = { data: { web: { results: [{ title: 'Bike light $29.99', description: 'In stock', url: 'https://shop.example/light' }] } } };
const braveError = (status, headers = {}) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, headers } });

describe('web enrichment', () => {
  const savedKey = process.env.BRAVE_SEARCH_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BRAVE_SEARCH_API_KEY = 'test-brave-key';
    Recipient.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ firstName: 'Paul', tags: [] }) });
    Event.findById.mockResolvedValue({ name: 'Anniversary' });
    SuggestionHistory.find.mockReturnValue({ sort: () => ({ limit: async () => [] }) });
    enhancedAiService.getEnhancedGiftSuggestions.mockResolvedValue([idea('Bike light'), idea('Jersey'), idea('Map book')]);
  });

  afterAll(() => {
    if (savedKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = savedKey;
  });

  const run = () => getWebEnhancedGiftSuggestions('r', 'e', 'u', {});

  it('reports zero successful searches when every Brave call fails', async () => {
    axios.get.mockRejectedValue(braveError(422));
    const { suggestions, webSearch } = await run();
    expect(webSearch).toEqual({ configured: true, attempted: 2, succeeded: 0, rateLimited: false });
    expect(suggestions.map((s) => s.webSearch)).toEqual(['failed', 'failed', 'skipped']);
    expect(suggestions.map((s) => s.name)).toEqual(['Bike light', 'Jersey', 'Map book']);
  });

  it('reports a missing key without calling Brave', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const { webSearch } = await run();
    expect(webSearch).toMatchObject({ configured: false, attempted: 0, succeeded: 0 });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('counts the searches that worked', async () => {
    axios.get.mockResolvedValueOnce(braveOk).mockRejectedValueOnce(braveError(500));
    const { suggestions, webSearch } = await run();
    expect(webSearch).toMatchObject({ attempted: 2, succeeded: 1 });
    expect(suggestions[0].webSearch).toBe('ok');
    expect(suggestions[1].webSearch).toBe('failed');
  });

  it('flags a rate limit but never passes Brave headers on', async () => {
    axios.get.mockResolvedValueOnce(braveOk)
      .mockRejectedValueOnce(braveError(429, { 'x-ratelimit-limit': '1, 2000', 'x-ratelimit-remaining': '0, 1984' }));
    const result = await run();
    expect(result.webSearch.rateLimited).toBe(true);
    expect(result.suggestions[1].webSearch).toBe('rate_limited');
    expect(JSON.stringify(result)).not.toMatch(/x-ratelimit|1984/i);
  });

  it('waits at least 1.1 s after the previous search has finished', async () => {
    const times = [];
    axios.get.mockImplementation(() => {
      times.push({ start: Date.now() });
      return new Promise((resolve) => setTimeout(() => {
        times[times.length - 1].end = Date.now();
        resolve(braveOk);
      }, 400));
    });
    await run();
    expect(times).toHaveLength(2);
    expect(times[1].start - times[0].end).toBeGreaterThanOrEqual(1090);
  });

  it('keeps the 1.1 s gap when two generations search at the same time', async () => {
    const times = [];
    axios.get.mockImplementation(() => {
      const entry = { start: Date.now() };
      times.push(entry);
      return new Promise((resolve) => setTimeout(() => { entry.end = Date.now(); resolve(braveOk); }, 200));
    });
    await Promise.all([run(), run()]);
    expect(times).toHaveLength(4);
    const ordered = [...times].sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].start - ordered[i - 1].end).toBeGreaterThanOrEqual(1090);
    }
  });

  it('an answer with no results does not count as a search that worked', async () => {
    axios.get.mockResolvedValue({ data: { web: { results: [] } } });
    const { suggestions, webSearch } = await run();
    expect(webSearch).toMatchObject({ attempted: 2, succeeded: 0 });
    expect(suggestions[0].webSearch).toBe('no_results');
  });

  describe('the pages each suggestion was checked against', () => {
    const results = (list) => ({ data: { web: { results: list } } });

    it('attaches its own search results: http(s) only, at most 3, host from the URL', async () => {
      axios.get.mockResolvedValueOnce(results([
        { title: 'Bad', url: 'javascript:alert(1)', description: 'bike light' },
        { title: 'Inline', url: 'data:text/html,hi', description: 'bike light' },
        { title: '<strong>Bike</strong> light at evil.example', url: 'https://www.shop.example/light#reviews', description: 'Only $9.99 in stock, 4.9 stars' },
        { title: 'FTP', url: 'ftp://files.example/x', description: 'bike light' },
        { title: 'Second', url: 'http://blog.example/post', description: 'Our bike light test' },
        { title: 'x'.repeat(300), url: 'https://long.example/', description: 'lights for bikes' },
        { title: 'Fourth', url: 'https://fourth.example/', description: 'bike light' }
      ])).mockResolvedValueOnce(results([]));
      const { suggestions, braveUrls } = await run();
      expect(suggestions[0].webSources).toEqual([
        { title: 'Bike light at evil.example', url: 'https://www.shop.example/light', host: 'shop.example' },
        { title: 'Second', url: 'http://blog.example/post', host: 'blog.example' },
        { title: 'x'.repeat(120), url: 'https://long.example/', host: 'long.example' }
      ]);
      expect(braveUrls).toEqual(expect.arrayContaining(['https://www.shop.example/light', 'https://fourth.example/']));
      expect(suggestions[1].webSources).toEqual([]);
    });

    it('takes no price, availability or rating from web text', async () => {
      axios.get.mockResolvedValue(results([{ title: 'Bike light $9.99', url: 'https://shop.example/a', description: 'In stock. 4.9 out of 5, 120 reviews' }]));
      const { suggestions } = await run();
      expect(suggestions[0].estimatedPrice).toBe(30);
      ['currentPrice', 'availability', 'reviews', 'trendingScore', 'alternativeProducts'].forEach((field) => {
        expect(suggestions[0]).not.toHaveProperty(field);
      });
    });

    it('drops any web source the AI answer brought along', async () => {
      enhancedAiService.getEnhancedGiftSuggestions.mockResolvedValue([
        { ...idea('Bike light'), webSources: [{ title: 'Made up', url: 'https://invented.example/x', host: 'invented.example' }] }
      ]);
      axios.get.mockResolvedValue(results([]));
      const { suggestions } = await run();
      expect(suggestions[0].webSources).toEqual([]);
    });
  });

  it('searches by the suggestion name and category only', async () => {
    axios.get.mockResolvedValue({ data: { web: { results: [] } } });
    await run();
    expect(axios.get.mock.calls[0][1].params.q).toBe('Bike light Sports');
  });

  // Live results (2026-10-16) that were attached although unrelated
  describe('only results about the suggestion become links', () => {
    const results = (list) => ({ data: { web: { results: list } } });
    const runFor = async (name, list) => {
      enhancedAiService.getEnhancedGiftSuggestions.mockResolvedValue([{ ...idea(name), category: 'Books' }]);
      axios.get.mockResolvedValueOnce(results(list));
      const { suggestions } = await run();
      return suggestions[0].webSources;
    };

    it('the bouldering book set gets none of the unrelated best-of lists', async () => {
      const sources = await runFor('Bouldering Technique Improvement Book Set', [
        { title: 'Best Technical Analysis Books 2026 | 7 Top Picks', url: 'https://eltraderfinanciado.com/books' },
        { title: "The Best Kids' Books of the Year, According to 125 Young Readers", url: 'https://www.goodhousekeeping.com/kids-books' },
        { title: 'Top 20 Trading Books Every Trader Must Read in 2026', url: 'https://quomarkets.com/trading-books' }
      ]);
      expect(sources).toEqual([]);
    });

    it('the sci-fi bookmark: the live shop pages share no distinctive word, so none is kept', async () => {
      // "science", "fiction", "engraved", "bookmark" are the distinctive words;
      // "SciFier.com" and "Sci-Fi" are not the same words, so the rule drops them
      const sources = await runFor('Custom Science Fiction Book Engraved Bookmark', [
        { title: 'SciFier.com - The One Stop Galactic Book Shop', url: 'https://scifier.com/' },
        { title: 'A Whimsical Guide to Online Sci-Fi Book Shopping', url: 'https://cosmicnovels.com/guide' }
      ]);
      expect(sources).toEqual([]);
    });

    // Live results (2026-10-16, second round): one shared word was not enough
    it('climbing gloves: gym glove pages sharing only "gloves" are dropped', async () => {
      const sources = await runFor('High-Performance Climbing Gloves', [
        { title: 'Best Weightlifting Gloves in 2026: for Enhanced Grip and Wrist Support - ICGI', url: 'https://icgi.org/weightlifting-gloves' },
        { title: 'Best Workout Gloves in 2026: for Enhanced Comfort and Grip - ICGI', url: 'https://icgi.org/workout-gloves' },
        { title: 'Best Gym Gloves in 2026: for Superior Palm Protection and Grip - ICGI', url: 'https://icgi.org/gym-gloves' },
        { title: 'Best Climbing Gloves 2026', url: 'https://climb.example/gloves' }
      ]);
      expect(sources.map((src) => src.host)).toEqual(['climb.example']);
    });

    it('science fiction anthology: pages naming science fiction are kept, a "Sci-Fi" title is not', async () => {
      const sources = await runFor('Science Fiction Anthology Box Set', [
        { title: 'Gorgeous Editions of Your Favorite Science Fiction and Fantasy Books', url: 'https://bookriot.com/editions' },
        { title: "File 770 | Mike Glyer's news of science fiction fandom", url: 'https://file770.com/' },
        { title: '8 Most Entertaining Sci-Fi Books of the 21st Century', url: 'https://www.polygon.com/scifi-books' }
      ]);
      expect(sources.map((src) => src.host)).toEqual(['bookriot.com', 'file770.com']);
    });

    it('keeps a result that names a distinctive word, in the title or the description, plural allowed', async () => {
      const sources = await runFor('Custom Science Fiction Book Engraved Bookmark', [
        { title: 'Engraved bookmarks for readers', url: 'https://maker.example/bookmarks' },
        { title: 'Gift shop', description: 'Classic science fiction novels and more', url: 'https://shop.example/sf' },
        { title: 'Custom Book Gift Set Collection', description: 'Deluxe premium bundle', url: 'https://generic.example/' }
      ]);
      expect(sources.map((src) => src.host)).toEqual(['maker.example', 'shop.example']);
    });
  });

  it('logs the result URLs of the generation as one named list', async () => {
    const logger = require('../../utils/logger');
    axios.get.mockResolvedValueOnce(braveOk).mockResolvedValueOnce({ data: { web: { results: [] } } });
    await run();
    expect(logger.debug).toHaveBeenCalledWith({
      message: '[webSearchAiService] Brave result URLs',
      urls: ['https://shop.example/light']
    });
  });

  it('passes a typed AI failure on unchanged and calls no web search', async () => {
    const { providerFailed } = require('../../utils/aiErrors');
    enhancedAiService.getEnhancedGiftSuggestions.mockRejectedValue(providerFailed(new Error('outage')));
    await expect(run()).rejects.toMatchObject({ code: 'AI_PROVIDER_FAILED', statusCode: 502 });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('fails plainly when the recipient is missing', async () => {
    Recipient.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    await expect(run()).rejects.toThrow('Failed to generate web-enhanced gift suggestions');
    expect(enhancedAiService.getEnhancedGiftSuggestions).not.toHaveBeenCalled();
  });
});
