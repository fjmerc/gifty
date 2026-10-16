const asyncHandler = require('express-async-handler');
const Gift = require('../models/Gift');
const Recipient = require('../models/Recipient');
const Event = require('../models/Event');
const User = require('../models/User');
const { getAISuggestions } = require('../services/aiService');
const { getEnhancedGiftSuggestions } = require('../services/enhancedAiService');
const { getWebEnhancedGiftSuggestions } = require('../services/webSearchAiService');
const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../utils/suggestionUtilsEnhanced');
const suggestionConfig = require('../config/suggestionConfig');
const hybridSuggestionService = require('../services/hybridSuggestionService');
const suggestionCache = require('../services/suggestionCacheService');
const modelRegistry = require('../services/ai/modelRegistry');
const SuggestionHistory = require('../models/SuggestionHistory');
const { findOwned, assertOwnedRefs, pickFields, HttpError } = require('../utils/ownership');
const { checkPurchase, getSuggestionPriceGuide } = require('../services/moneyService');
const { parseDateOnly, yearInTimeZone } = require('../utils/dates');
const { roundMoney, formatMoney } = require('../utils/money');
const { isUsableSuggestion } = require('../utils/aiErrors');
const { readSuggestionPrice } = require('../utils/suggestionPrice');
const { isSimilarToAny } = require('../utils/giftSimilarity');
const { buildWebSources } = require('../utils/webSources');
const { fieldLines, localeLine, oneLine } = require('../utils/promptFields');
const aiConfig = require('../config/aiConfig');
const logger = require('../utils/logger');

// Gift fields a client may set from the add/edit gift form. Ownership (user)
// and AI provenance are server-controlled; status and purchaseDate go
// through writeGift so purchases stay atomic; recipient/event arrive as
// recipientId/eventId and are ownership-checked separately.
const GIFT_FORM_FIELDS = ['name', 'description', 'price', 'category', 'tags', 'priceRange', 'whereToBuy', 'favorite'];
// A gift can be created already purchased: money is derived from purchases,
// so there is no budget charge to bypass (one save-and-purchase request)
const CREATE_STATUSES = ['suggestion', 'saved', 'purchased'];
const GIFT_STATUSES = ['suggestion', 'saved', 'purchased', 'ignored'];

// How many already-chosen gift names a prompt lists (the most recent)
const MAX_CHOSEN_IN_PROMPT = 50;

// Price is required; 0 (a free gift) is allowed, negatives fail schema validation
const isMissingPrice = (price) => price === undefined || price === null || price === '';

const purchaseWarning = (check) => (check && check.wouldExceedBy > 0
    ? `This purchase puts the recipient over budget by ${formatMoney(check.wouldExceedBy, check.currency)}`
    : null);

// Answer a write with the recipient and event named, the shape GET /gifts
// lists: pages spread the answer over the card they show
const withNames = (gift) => Gift.populate(gift, [
    { path: 'recipient', select: 'firstName lastName' },
    { path: 'event', select: 'name date' }
]);

const timeOf = (date) => (date ? new Date(date).getTime() : null);
const changesPurchaseMoney = (before, after) =>
    roundMoney(before.price) !== roundMoney(after.price)
    || timeOf(before.purchaseDate) !== timeOf(after.purchaseDate)
    || String(before.recipient) !== String(after.recipient);

/**
 * Apply an edit and/or status change to one of the caller's gifts in a
 * single atomic write. Totals are derived from purchases on read, so this is
 * all a purchase, un-purchase, re-price, move or re-date needs. Becoming
 * purchased is guarded by `status != 'purchased'`, so a double click or two
 * tabs can't buy the same gift twice. A client purchaseDate counts only as
 * a YYYY-MM-DD day; otherwise the purchase is dated "now". A gift that is
 * not purchased never keeps a purchaseDate.
 */
const writeGift = async ({ gift, userId, updates = {}, requestedStatus, purchaseDateInput }) => {
    const wasPurchased = gift.status === 'purchased';
    const willBePurchased = requestedStatus ? requestedStatus === 'purchased' : wasPurchased;
    const clientDate = parseDateOnly(purchaseDateInput);
    const set = { ...updates };
    if (set.price !== undefined) {
        set.price = roundMoney(set.price);
        // "Over budget" described the AI's price when it was suggested; a
        // price the user set is no longer that estimate
        if (set.price !== roundMoney(gift.price)) set.overBudget = false;
    }
    const update = { $set: set };
    const filter = { _id: gift._id, user: userId };

    if (willBePurchased) {
        if (!wasPurchased) {
            set.status = 'purchased';
            set.purchaseDate = clientDate || new Date();
            filter.status = { $ne: 'purchased' };
        } else if (clientDate) {
            set.purchaseDate = clientDate;
        }
    } else {
        if (requestedStatus) set.status = requestedStatus;
        if (wasPurchased || gift.purchaseDate) update.$unset = { purchaseDate: '' };
    }

    const saved = await Gift.findOneAndUpdate(filter, update, { new: true, runValidators: true });
    if (!saved) {
        // Lost the race to another purchase of the same gift, or it was deleted
        if (await Gift.exists({ _id: gift._id, user: userId })) {
            throw new HttpError(400, 'Gift has already been purchased');
        }
        throw new HttpError(404, 'Gift not found');
    }
    const budgetCheck = saved.status === 'purchased' ? await checkPurchase(userId, saved._id) : null;
    // Warn only when this write changes the money: a new purchase, or a new
    // price, date or recipient on a purchased gift (never on a rename)
    const warn = budgetCheck && (!wasPurchased || changesPurchaseMoney(gift, saved));
    return { gift: await withNames(saved), warning: warn ? purchaseWarning(budgetCheck) : null, budgetCheck };
};

// An id from the request body: a non-empty string/ObjectId, never a populated object
const refId = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string') return value;
    if (value && value._bsontype === 'ObjectId') return value;
    return undefined;
};

exports.createGift = asyncHandler(async (req, res) => {
    const eventId = refId(req.body.eventId) || refId(req.body.event);
    const recipientId = refId(req.body.recipientId) || refId(req.body.recipient);
    const { name, price } = req.body;

    if (!eventId || !recipientId || !name || isMissingPrice(price)) {
        res.status(400);
        throw new Error('Please add all required fields');
    }

    // The recipient and event must both belong to the caller
    await assertOwnedRefs(req.user._id, [
        [Recipient, recipientId, 'Recipient'],
        [Event, eventId, 'Event']
    ]);

    const fields = pickFields(req.body, GIFT_FORM_FIELDS);
    if (CREATE_STATUSES.includes(req.body.status)) {
        fields.status = req.body.status;
    }
    if (fields.status === 'purchased') {
        fields.purchaseDate = parseDateOnly(req.body.purchaseDate) || new Date();
    }

    const gift = await Gift.create({
        ...fields,
        user: req.user._id,
        event: eventId,
        recipient: recipientId
    });

    const budgetCheck = gift.status === 'purchased' ? await checkPurchase(req.user._id, gift._id) : null;
    res.status(201).json({ gift: await withNames(gift), warning: purchaseWarning(budgetCheck), budgetCheck });
});

exports.purchaseGift = asyncHandler(async (req, res) => {
    // Malformed ids and other users' gifts are the same 404
    const gift = await findOwned(Gift, req.params.giftId, req.user._id, { label: 'Gift' });
    if (gift.status === 'purchased') {
        return res.status(400).json({ message: 'Gift has already been purchased' });
    }
    const result = await writeGift({
        gift,
        userId: req.user._id,
        requestedStatus: 'purchased',
        purchaseDateInput: req.body && req.body.purchaseDate
    });
    res.json({
        gift: result.gift,
        message: 'Gift purchased successfully',
        warning: result.warning,
        budgetCheck: result.budgetCheck
    });
});

exports.getGifts = asyncHandler(async (req, res) => {
    logger.debug('[getGifts] Fetching gifts for user:', req.user._id);
    
    // Parse pagination parameters (pages call with limit=1000 for full lists)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    if (page < 1 || limit < 1 || limit > 1000) {
        res.status(400);
        throw new Error('page must be 1 or more and limit between 1 and 1000');
    }
    const skip = (page - 1) * limit;
    
    // Parse sorting parameters
    const sortField = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sortOptions = {};
    sortOptions[sortField] = sortOrder;
    
    // Parse filtering parameters
    const filter = { user: req.user._id };
    
    // Add status filter if provided
    if (req.query.status && ['suggestion', 'saved', 'purchased', 'ignored'].includes(req.query.status)) {
        filter.status = req.query.status;
    }
    
    // Add recipient filter if provided
    if (req.query.recipientId) {
        filter.recipient = req.query.recipientId;
    }
    
    // Add event filter if provided
    if (req.query.eventId) {
        filter.event = req.query.eventId;
    }
    
    // Add favorite filter if provided
    if (req.query.favorite === 'true') {
        filter.favorite = true;
    }
    
    // Select only the fields we need
    const projection = req.query.fields ? req.query.fields.split(',').join(' ') : '';
    
    // Count total matching documents for pagination info
    const total = await Gift.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    logger.debug('[getGifts] Query parameters:', {
        page, limit, skip, sortBy: sortField, sortOrder, filter
    });
    
    // Execute query with pagination, sorting, and field projection
    const gifts = await Gift.find(filter, projection)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate('recipient', 'firstName lastName')
        .populate('event', 'name date');

    logger.debug('[getGifts] Found gifts:', gifts.length, 'of', total);

    res.json({
        gifts: gifts.map((gift) => gift.toObject()),
        pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        }
    });
});

exports.updateGift = asyncHandler(async (req, res) => {
    const gift = await findOwned(Gift, req.params.giftId, req.user._id, { label: 'Gift' });

    const requestedStatus = req.body.status;
    if (requestedStatus !== undefined && !GIFT_STATUSES.includes(requestedStatus)) {
        res.status(400);
        throw new Error('Invalid status');
    }

    // Only editable form fields; never user or AI provenance
    const updates = pickFields(req.body, GIFT_FORM_FIELDS);
    if ('price' in updates && isMissingPrice(updates.price)) {
        res.status(400);
        throw new Error('Price is required');
    }
    // The edit form sends recipientId/eventId alongside the stale populated
    // recipient/event objects from initialData; use the ids, ignore objects
    const newRecipient = refId(req.body.recipientId) || refId(req.body.recipient);
    const newEvent = refId(req.body.eventId) || refId(req.body.event);
    await assertOwnedRefs(req.user._id, [
        [Recipient, newRecipient, 'Recipient'],
        [Event, newEvent, 'Event']
    ]);
    if (newRecipient) updates.recipient = newRecipient;
    if (newEvent) updates.event = newEvent;

    const result = await writeGift({
        gift,
        userId: req.user._id,
        updates,
        requestedStatus,
        purchaseDateInput: req.body.purchaseDate
    });
    res.json(result);
});

exports.deleteGift = asyncHandler(async (req, res) => {
    const gift = await findOwned(Gift, req.params.giftId, req.user._id, { label: 'Gift' });
    // Spent is derived from purchases: deleting a purchased gift needs no refund
    await Gift.deleteOne({ _id: gift._id, user: req.user._id });
    res.status(200).json({ message: 'Gift removed' });
});

exports.generateGiftSuggestions = asyncHandler(async (req, res) => {
    // Check if the user wants enhanced suggestions (with machine learning)
    const useEnhancedSuggestions = req.query.enhanced === 'true' || req.body.enhanced === true;
    // Check if the user wants web-enhanced suggestions (with real-time web search)
    const useWebSearch = req.query.webEnhanced === 'true' || req.body.webEnhanced === true;
    // Check if the user wants hybrid suggestions (discovered gifts + AI)
    const useHybridSuggestions = req.query.hybrid === 'true' || req.body.hybrid === true;
    logger.debug('[generateGiftSuggestions] Starting gift suggestion generation...');
    const { recipientId, eventId } = req.body;

    if (!recipientId || !eventId) {
        res.status(400);
        throw new Error('Please provide both recipient and event IDs');
    }

    logger.debug('[generateGiftSuggestions] Looking up recipient, event, and budget in parallel...');

    // Parallelize database lookups for better performance
    // Both must belong to the caller: the recipient profile is sent to the AI
    const [recipient, event] = await Promise.all([
        findOwned(Recipient, recipientId, req.user._id, { label: 'Recipient', populate: 'tags' }),
        findOwned(Event, eventId, req.user._id, { label: 'Event' })
    ]);

    if (!recipient || !event) {
        logger.debug('[generateGiftSuggestions] Recipient or event not found:', {
            recipientFound: !!recipient,
            eventFound: !!event
        });
        res.status(404);
        throw new Error('Recipient or Event not found');
    }

    // What the suggestions may cost: what is left of the recipient's budget
    // for the event's year, in that year's currency (every AI mode uses it)
    // Event dates are calendar days stored at UTC midnight: read them in UTC
    const budgetYear = event.date ? new Date(event.date).getUTCFullYear() : yearInTimeZone(new Date());
    const priceGuide = await getSuggestionPriceGuide(req.user._id, recipient, budgetYear);
    const suggestionBudget = priceGuide.max;

    logger.debug('[generateGiftSuggestions] Found recipient and event:', {
        recipientName: `${recipient.firstName} ${recipient.lastName}`,
        eventName: event.name,
        eventDate: event.date
    });

    logger.debug('[generateGiftSuggestions] Price guide:', { ...priceGuide, year: budgetYear });

    logger.debug('[generateGiftSuggestions] Using enhanced suggestions:', useEnhancedSuggestions);
    logger.debug('[generateGiftSuggestions] Using web search:', useWebSearch);
    logger.debug('[generateGiftSuggestions] Using hybrid suggestions:', useHybridSuggestions);

    // Resolve the user's preferred AI provider/model for this run.
    // Body fields take precedence (one-off override); otherwise fall
    // back to whatever the user saved in their preferences. If neither
    // is set, downstream services pick the env default.
    // lean: no schema defaults, so a holiday country never set stays unset
    const userDoc = await User.findById(req.user._id).select('preferences').lean();
    // Gifts already saved or bought for this recipient: every mode is told
    // not to suggest them again, and repeats are dropped after parsing
    // (most recent first). The post-parse filter uses all of them; prompts
    // list only the most recent, so a long history never crowds out the
    // instructions.
    const alreadyChosen = (await Gift.find({
        user: req.user._id, recipient: recipientId, status: { $in: ['saved', 'purchased'] }
    }).sort('-updatedAt').select('name').lean()).map((gift) => gift.name).filter(Boolean);
    const chosenForPrompt = alreadyChosen.slice(0, MAX_CHOSEN_IN_PROMPT);

    const aiOpts = {
        provider: req.body.aiProvider || userDoc?.preferences?.aiProvider || undefined,
        model: req.body.aiModel || userDoc?.preferences?.aiModel || undefined,
        priceGuide,
        alreadyChosen: chosenForPrompt,
        // Shops and prices that fit the household: its holiday country and
        // the budget year's currency
        locale: {
            country: userDoc?.preferences?.holidaySettings?.countryCode || null,
            currency: priceGuide.currency || null
        },
    };
    // An unknown or unconfigured provider, or a model it does not offer, is
    // refused rather than silently run as another model
    const choiceProblem = modelRegistry.validateChoice(aiOpts);
    if (choiceProblem) throw new HttpError(400, choiceProblem);
    logger.debug('[generateGiftSuggestions] AI provider/model:', aiOpts);

    // Suggestion dedup cache. Same {user, recipient, event, mode,
    // provider, model} within ~5min returns cached result so retries /
    // refreshes don't re-pay the LLM. The cache version is bumped on
    // feedback so newly rated gifts immediately influence subsequent
    // generations.
    const mode = useHybridSuggestions ? 'hybrid'
        : useWebSearch ? 'web'
        : useEnhancedSuggestions ? 'enhanced'
        : 'basic';
    const cacheVersion = await suggestionCache.getVersion(String(req.user._id), String(recipientId));
    const cacheKeyParts = {
        userId: String(req.user._id),
        recipientId: String(recipientId),
        eventId: String(eventId),
        mode,
        provider: aiOpts.provider,
        model: aiOpts.model,
        version: cacheVersion,
    };
    // The cached answer holds gifts saved minutes ago: offer only those still
    // open suggestions (not deleted, saved or rated away since). When none is
    // left, the user wants new ideas, so generate again.
    const cached = await suggestionCache.get(cacheKeyParts);
    const cachedIds = (cached?.suggestions || []).map((gift) => gift._id).filter(Boolean);
    const stillOpen = cachedIds.length
        ? await Gift.find({ _id: { $in: cachedIds }, user: req.user._id, recipient: recipientId, event: eventId, status: 'suggestion' })
            .populate('recipient', 'firstName lastName')
        : [];
    if (stillOpen.length) {
        logger.debug('[generateGiftSuggestions] Returning cached suggestions');
        const order = cachedIds.map(String);
        stillOpen.sort((a, b) => order.indexOf(String(a._id)) - order.indexOf(String(b._id)));
        return res.status(200).json({
            ...cached,
            suggestions: stillOpen.map((gift) => gift.toObject()),
            fromCache: true,
        });
    }

    // Recent suggestion history, used by basic mode (prompt exclusion
    // list) and hybrid mode (library pool filter + AI avoid list).
    // Enhanced and web modes read history themselves. Fail open:
    // history is an optimization, never worth failing the run over.
    let previouslySuggested = [];
    try {
        const recentHistory = await SuggestionHistory.find({
            user: req.user._id,
            recipient: recipientId,
            shownAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
        }).sort('-shownAt').limit(20).select('giftMetadata.name');
        previouslySuggested = recentHistory
            .map(entry => entry.giftMetadata?.name)
            .filter(Boolean);
    } catch (error) {
        logger.warn('[generateGiftSuggestions] Failed to load suggestion history:', error.message);
    }

    let aiSuggestions;
    let webSearchInfo = null;
    let webUrlsThisRun = null;
    
    try {
        if (useHybridSuggestions) {
            // Use the new hybrid suggestion service
            logger.debug('[generateGiftSuggestions] Getting hybrid suggestions...');
            
            // Check hybrid system health
            const systemHealth = await hybridSuggestionService.isHybridSystemHealthy();
            logger.debug('[generateGiftSuggestions] Hybrid system health:', systemHealth);
            
            if (systemHealth?.isHealthy) {
                // Create recipient profile for hybrid service
                const safeInterests = [...(recipient.interests || []), ...(recipient.hobbies || [])];
                const recipientProfile = {
                    age: recipient.age,
                    gender: recipient.gender,
                    interests: safeInterests,
                    relationship: recipient.relation,
                    occasion: event.name,
                    budget: suggestionBudget
                };
                
                const hybridOptions = {
                    count: 5,
                    budget: suggestionBudget,
                    includeSources: true,
                    ai: aiOpts,
                    excludeNames: [...previouslySuggested, ...chosenForPrompt]
                };
                
                const hybridSuggestions = await hybridSuggestionService.generateHybridSuggestions(recipientProfile, hybridOptions);
                
                // Convert hybrid suggestions to AI suggestion format
                aiSuggestions = hybridSuggestions.map(suggestion => ({
                    name: suggestion.name,
                    description: suggestion.description,
                    // The middle of the gift's range; no range, no price (dropped)
                    ...readSuggestionPrice(suggestion.estimatedPrice, suggestion.priceRange?.min, suggestion.priceRange?.max),
                    category: suggestion.categories[0] || 'Miscellaneous',
                    tags: suggestion.tags,
                    whereToBuy: suggestion.sourceUrl ? [suggestion.sourceUrl] : [],
                    relevanceScore: suggestion.matchScore || 50,
                    isDiscovered: suggestion.source === 'discovered',
                    sourceInfo: suggestion.sourceDetails
                }));
            } else {
                // System is unhealthy, fall back to enhanced suggestions.
                // Surface the downgrade to the client — a silent fallback
                // reads as "hybrid mode is broken" to the user.
                logger.debug('[generateGiftSuggestions] Hybrid system unhealthy, falling back to enhanced suggestions');
                webSearchInfo = {
                    warning: `Hybrid mode unavailable: the gift library has ${systemHealth?.totalGifts ?? 0} active gifts (needs over ${hybridSuggestionService.minLibrarySize}). Showing enhanced AI suggestions instead.`,
                    fallback: { requestedMode: 'hybrid', actualMode: 'enhanced' }
                };
                aiSuggestions = await getEnhancedGiftSuggestions(recipientId, eventId, req.user._id, aiOpts);
            }
            
        } else if (useWebSearch) {
            // Use the web-enhanced AI service with real-time search
            logger.debug('[generateGiftSuggestions] Getting web-enhanced AI suggestions...');
            const webResult = await getWebEnhancedGiftSuggestions(recipientId, eventId, req.user._id, aiOpts);
            aiSuggestions = webResult.suggestions;
            // Only links the web search returned in this generation are kept
            webUrlsThisRun = new Set(webResult.braveUrls || []);
            webSearchInfo = describeWebSearch(webResult.webSearch);
        } else if (useEnhancedSuggestions) {
            // Use the enhanced AI service with machine learning insights
            logger.debug('[generateGiftSuggestions] Getting enhanced AI suggestions...');
            aiSuggestions = await getEnhancedGiftSuggestions(recipientId, eventId, req.user._id, aiOpts);
        } else {
            // Use the standard AI service. Give the model the recent
            // suggestion history so it can avoid repeats — without a
            // concrete list the "don't repeat" instruction is a no-op.
            const prompt = createPrompt(recipient, event, previouslySuggested, priceGuide, chosenForPrompt, aiOpts.locale);
            logger.debug('[generateGiftSuggestions] Getting standard AI suggestions with prompt length:', prompt.length);
            
            // Extract recipient tags for the AI service
            const recipientTagNames = recipient.tags && Array.isArray(recipient.tags) 
                ? recipient.tags.map(tag => tag.name)
                : [];
            logger.debug('[generateGiftSuggestions] Recipient tags:', recipientTagNames);
            
            aiSuggestions = await getAISuggestions(prompt, recipientTagNames, aiOpts);
        }
    } catch (error) {
        // No second attempt: the web service already copes with web search
        // problems, so an error here is the AI itself (typed, 502) or a bug
        logger.error('[generateGiftSuggestions] Error generating suggestions:', error.message);
        throw error;
    }
    
    // Only suggestions with a name and a usable price are saved; a model
    // glitch never becomes a placeholder gift
    aiSuggestions = (aiSuggestions || []).filter(isUsableSuggestion);
    logger.debug('[generateGiftSuggestions] Received AI suggestions:', 
        aiSuggestions.map(s => ({ name: s.name, price: s.estimatedPrice }))
    );

    // Check if filtering has been too aggressive
    const filteringStatus = await isFilteringTooAggressive(req.user._id, recipientId);
    logger.debug('[generateGiftSuggestions] Filtering status:', filteringStatus);
    
    // Get dynamic cooldown period
    const cooldownPeriod = await getDynamicCooldownPeriod(req.user._id, recipientId);
    logger.debug('[generateGiftSuggestions] Dynamic cooldown period:', cooldownPeriod);
    
    // Configure filtering options
    const filterOptions = {
      minimumSuggestions: suggestionConfig.filtering.minimumSuggestions,
      cooldownPeriod,
      similarityThreshold: suggestionConfig.filtering.similarityThreshold,
      forceBypass: filteringStatus.isTooAggressive,
      priceGuide
    };
    
    // Filter out previously ignored suggestions with enhanced filtering
    let filteredSuggestions = await filterIgnoredSuggestions(
      aiSuggestions, 
      req.user._id,
      recipientId,
      filterOptions
    );

    // Never offer again what was already saved or bought for this recipient,
    // nor something with a near-identical name (whatever the filters above did)
    filteredSuggestions = filteredSuggestions.filter((suggestion) =>
        !isSimilarToAny(suggestion.name, alreadyChosen, suggestionConfig.filtering.similarityThreshold));

    // Above the price guide: kept, but flagged so the page can tag it
    filteredSuggestions.forEach((suggestion) => {
        suggestion.overBudget = priceGuide.max !== null && priceGuide.max !== undefined
            && suggestion.estimatedPrice > priceGuide.max;
    });

    logger.debug('[generateGiftSuggestions] After filtering ignored suggestions:',
      `${aiSuggestions.length - filteredSuggestions.length} suggestions filtered out`
    );

    // The route timeout may already have answered (408): the user never sees
    // these suggestions, so saving them would only make them turn up later
    // unexplained
    if (res.headersSent) {
        logger.warn('[generateGiftSuggestions] Response already sent (likely timeout), not saving suggestions');
        return;
    }

    logger.debug('[generateGiftSuggestions] Creating gift objects...');
    const savedSuggestions = await Promise.all(filteredSuggestions.map(async suggestion => {
        logger.debug('[generateGiftSuggestions] Creating gift:', {
            name: suggestion.name,
            price: suggestion.estimatedPrice,
            category: suggestion.category,
            tags: suggestion.tags,
            eventDate: event.date
        });

        const newGift = new Gift({
            user: req.user._id,
            recipient: recipientId,
            event: eventId,
            name: suggestion.name,
            description: suggestion.description,
            category: suggestion.category,
            tags: suggestion.tags,
            price: suggestion.estimatedPrice,
            priceRange: suggestion.priceRange,
            whereToBuy: suggestion.whereToBuy,
            status: 'suggestion',
            isAISuggested: true,
            aiProvider: suggestion.aiProvider,
            aiModel: suggestion.aiModel,
            relevanceScore: suggestion.relevanceScore,
            overBudget: Boolean(suggestion.overBudget),
            generatedAt: new Date(),
            // Web-Enhanced: links to the pages the search returned for it
            webSources: webUrlsThisRun ? buildWebSources(suggestion.webSources, webUrlsThisRun) : undefined,
            // Include metadata for discovered gifts
            isDiscovered: suggestion.isDiscovered || false,
            sourceType: suggestion.sourceInfo?.type || 'ai_generated',
            sourceUrl: suggestion.sourceInfo?.url || null,
            popularityScore: suggestion.sourceInfo?.popularity || null
        });

        const savedGift = await newGift.save();
        logger.debug('[generateGiftSuggestions] Gift saved:', { giftId: savedGift._id });

        // Record in suggestion history so future generations (all modes)
        // can exclude it. Best-effort: history is an optimization, never
        // worth failing the user's request over.
        try {
            await SuggestionHistory.recordSuggestion({
                user: req.user._id,
                recipient: recipientId,
                gift: savedGift._id,
                relevanceScore: suggestion.relevanceScore,
                giftName: savedGift.name,
                giftCategory: savedGift.category,
                giftTags: savedGift.tags,
                giftPrice: savedGift.price,
                cooldownPeriod
            });
        } catch (error) {
            logger.warn('[generateGiftSuggestions] Failed to record suggestion history:', error.message);
        }

        return savedGift;
    }));

    logger.debug('[generateGiftSuggestions] Populating recipient information...');
    const populatedSuggestions = await Gift.populate(savedSuggestions, {
        path: 'recipient',
        select: 'firstName lastName'
    });
    const responseSuggestions = populatedSuggestions.map((gift) => gift.toObject());

    logger.debug('[generateGiftSuggestions] Sending response with', responseSuggestions.length, 'suggestions');

    // Include web search info in response if available
    const response = {
        suggestions: responseSuggestions,
        webSearchInfo: webSearchInfo
    };

    // Guard against sending response if timeout already sent one
    if (res.headersSent) {
        logger.warn('[generateGiftSuggestions] Response already sent (likely timeout), skipping');
        return;
    }

    // Store the final response in the dedup cache. Best-effort — failure
    // doesn't block the user. The cache version we resolved earlier is
    // already part of the key, so any feedback recorded in parallel will
    // have bumped that version and won't actually return this entry.
    // An empty answer is not cached: asking again should ask the AI again.
    if (responseSuggestions.length > 0) {
        suggestionCache.set(cacheKeyParts, response).catch(() => {});
    }

    res.status(201).json(response);
});

// What the page is told about web mode's searches: whether any worked, and
// a warning when some or all did not. Never Brave's own headers or quota.
function describeWebSearch({ configured, attempted, succeeded, rateLimited }) {
    const info = {
        searchPerformed: succeeded > 0,
        searchesAttempted: attempted,
        searchesSucceeded: succeeded,
        timestamp: new Date().toISOString()
    };
    if (!configured) {
        info.warning = 'Web search is not set up on this server. Showing AI-only suggestions.';
    } else if (attempted > 0 && succeeded === 0) {
        info.warning = rateLimited
            ? 'Web search is busy right now (rate limit). Showing AI-only suggestions.'
            : 'Web search is unavailable right now. Showing AI-only suggestions.';
    } else if (succeeded < attempted) {
        info.warning = `Web search worked for ${succeeded} of ${attempted} suggestions${rateLimited ? ' (rate limit reached)' : ''}.`;
    }
    return info;
}

// The budget lines of a suggestion prompt, in the budget's currency
function describePriceGuide({ min = 0, max = null, currency = 'USD' } = {}) {
    if (max === null || max === undefined) {
        return `There is no fixed budget for this gift: suggest gifts at sensible prices. Give prices in ${currency}.`;
    }
    return `My budget for this gift is ${formatMoney(min, currency)} to ${formatMoney(max, currency)}. Give prices in ${currency}.
        Every suggestion's estimated price MUST fall within this range. Do NOT suggest anything priced above ${formatMoney(max, currency)}.`;
}

function createPrompt(recipient, event, previouslySuggested = [], priceGuide = {}, alreadyChosen = [], locale = {}) {
    const fullName = `${recipient.firstName} ${recipient.lastName}`;
    const tagNames = Array.isArray(recipient.tags) ? recipient.tags.map((tag) => tag && tag.name) : [];
    const listLines = (title, names) => (names.length > 0
        ? `\n${title}:\n${names.map((name) => `- ${oneLine(name)}`).join('\n')}\n`
        : '');
    const section = (title, body) => (body ? `\n${title}:\n${body}\n` : '');
    const sizes = recipient.clothingSizes || {};
    const wishList = (recipient.wishList || []).filter((item) => item && item.item)
        .map((item) => `${item.item}${item.priority ? ` (priority: ${item.priority})` : ''}`);
    const who = [
        `my ${recipient.relation || 'friend'} named ${fullName}`,
        recipient.age ? `who is ${recipient.age} years old` : ''
    ].filter(Boolean).join(' ');
    const when = event.date ? ` which is on ${new Date(event.date).toLocaleDateString('en-US', { timeZone: 'UTC' })}` : '';
    const count = aiConfig.basic.candidateCount;

    // Only what is known is sent: an empty field is left out, not printed as
    // "undefined" or "Not specified" (which invites made-up details)
    return `I'm looking for highly specific and personalized gift recommendations for ${who}. The occasion is ${event.name}${when}.
${localeLine(locale) ? `\n${localeLine(locale)}\n` : ''}${section('Recipient profile', fieldLines([
        ['Tags', tagNames],
        ['Interests', recipient.interests],
        ['Hobbies', recipient.hobbies],
        ['Favorite colors', recipient.favoriteColors],
        ['Favorite books', recipient.favoriteBooks],
        ['Favorite movies', recipient.favoriteMovies],
        ['Favorite music', recipient.favoriteMusic],
        ['Personality traits', recipient.personalityTraits],
        ['Occupation', recipient.occupation],
        ['Work schedule', recipient.workSchedule],
        ['Gift preferences', recipient.giftPreferences]
    ], '    '))}${section('Relationship', fieldLines([
        ['Known each other for (years)', recipient.relationshipLength],
        ['Closeness', recipient.relationshipCloseness],
        ['Previous gifts that were well-received', recipient.previousGifts]
    ], '    '))}${section('Practical considerations (must be respected)', fieldLines([
        ['Dietary restrictions', recipient.dietaryRestrictions],
        ['Allergies', recipient.allergies],
        ['Clothing sizes', [sizes.shirt && `top ${sizes.shirt}`, sizes.pants && `bottom ${sizes.pants}`, sizes.shoe && `shoe ${sizes.shoe}`]],
        ['Living situation', recipient.livingSituation]
    ], '    '))}
Budget:
    ${describePriceGuide(priceGuide)}

Please provide ${count} highly detailed${recipient.giftPreferences ? ` ${recipient.giftPreferences}` : ''} gift suggestions that precisely match this person's specific interests and preferences. For each suggestion:

1. Include a detailed description explaining why this gift would be meaningful, including specific features and benefits
2. Assign an appropriate category (e.g., Electronics, Fashion, Books, Experience, Home Decor)
3. Include 3-5 relevant tags that describe this gift (e.g., "handmade, personalized, sustainable")
4. Provide a realistic price estimate with a price range
5. Suggest 2-3 specific stores or websites where this item can be purchased

Focus on gifts that show thoughtfulness and demonstrate understanding of the recipient's unique personality and interests. Use only the details given in this message; do not assume others. Be specific rather than generic.
${listLines('Wish list (in order of priority)', wishList)}${listLines('Already chosen for this recipient (saved or bought; do NOT suggest these again, or anything closely similar)', alreadyChosen)}${listLines('Previously Suggested Gifts (DO NOT suggest these again, or anything closely similar)', previouslySuggested)}`;
}


exports.updateGiftStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (!GIFT_STATUSES.includes(status)) {
        res.status(400);
        throw new Error('Invalid status');
    }

    const gift = await findOwned(Gift, req.params.giftId, req.user._id, { label: 'Gift' });
    if (status === 'purchased' && gift.status === 'purchased') {
        return res.json(await withNames(gift));
    }

    const result = await writeGift({
        gift,
        userId: req.user._id,
        requestedStatus: status,
        purchaseDateInput: req.body.purchaseDate
    });
    res.json(result.gift);
});

exports.toggleFavorite = asyncHandler(async (req, res) => {
    logger.debug('[toggleFavorite] Toggling favorite status...');
    const gift = await Gift.findById(req.params.giftId);

    if (!gift) {
        logger.debug('[toggleFavorite] Gift not found');
        res.status(404);
        throw new Error('Gift not found');
    }

    if (gift.user.toString() !== req.user._id.toString()) {
        // Someone else's gift is indistinguishable from a missing one
        logger.debug('[toggleFavorite] Gift belongs to another user');
        res.status(404);
        throw new Error('Gift not found');
    }

    gift.favorite = !gift.favorite;
    const updatedGift = await withNames(await gift.save());
    logger.debug('[toggleFavorite] Favorite toggled:', {
        giftId: gift._id,
        newFavoriteStatus: gift.favorite
    });

    res.json(updatedGift);
});

exports.getFavorites = asyncHandler(async (req, res) => {
    const favorites = await Gift.find({
        user: req.user._id,
        favorite: true
    })
    .populate('recipient', 'firstName lastName')
    .populate('event', 'name date');

    res.json(favorites.map((gift) => gift.toObject()));
});
