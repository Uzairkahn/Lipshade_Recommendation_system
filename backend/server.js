const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE_PATH = path.resolve(__dirname, '../database/lipsticks.json');
const VALID_UNDERTONES = new Set(['warm', 'cool', 'neutral']);

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

function normalizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().toLowerCase();
}

function getFirstAvailableValue(product, keys) {
  for (const key of keys) {
    if (product[key] !== undefined && product[key] !== null) {
      return product[key];
    }
  }

  return '';
}

function getShadeName(product) {
  return getFirstAvailableValue(product, ['shade_name', 'shadeName', 'shade', 'name']);
}

function getUndertoneValues(product) {
  const undertoneSource = getFirstAvailableValue(product, ['undertone', 'undertones']);

  if (Array.isArray(undertoneSource)) {
    return undertoneSource.map(normalizeText).filter(Boolean);
  }

  if (typeof undertoneSource === 'string') {
    return undertoneSource
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  return [];
}

function loadLipsticksData() {
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) {
      console.error(`[Data] Lipstick data file not found at ${DATA_FILE_PATH}`);
      return [];
    }

    const fileContents = fs.readFileSync(DATA_FILE_PATH, 'utf8').trim();

    if (!fileContents) {
      console.warn(`[Data] Lipstick data file is empty: ${DATA_FILE_PATH}`);
      return [];
    }

    const parsedData = JSON.parse(fileContents);

    if (!Array.isArray(parsedData)) {
      console.error('[Data] Invalid lipstick data format. Expected a JSON array.');
      return [];
    }

    return parsedData;
  } catch (error) {
    console.error(`[Data] Failed to load lipstick data: ${error.message}`);
    return [];
  }
}

function sendCollectionResponse(res, items, emptyMessage) {
  if (!items.length) {
    return res.status(200).json({
      message: emptyMessage,
      count: 0,
      data: [],
    });
  }

  return res.status(200).json({
    count: items.length,
    data: items,
  });
}

function calculateRecommendationScore(product, userPreferences) {
  let score = 0;

  // +2 points for undertone match (highest priority)
  const productUndertones = getUndertoneValues(product);
  if (productUndertones.includes(userPreferences.undertone)) {
    score += 2;
  }

  // +1 point for color_family match (if specified)
  if (userPreferences.color_family) {
    const productColorFamily = normalizeText(product.color_family);
    if (productColorFamily === userPreferences.color_family) {
      score += 1;
    }
  }

  // +1 point for finish match (if specified)
  if (userPreferences.finish) {
    const productFinish = normalizeText(product.finish);
    if (productFinish === userPreferences.finish) {
      score += 1;
    }
  }

  return score;
}

function enhanceProductWithScore(product, score) {
  return {
    ...product,
    score,
  };
}

app.get('/', (req, res) => {
  console.log('[Route] Health check successful.');
  res.send('Lipshade API Running');
});

app.get('/api/lipsticks', (req, res) => {
  const lipsticks = loadLipsticksData();
  console.log(`[Route] Returning ${lipsticks.length} lipstick product(s).`);

  return sendCollectionResponse(res, lipsticks, 'No lipstick products found.');
});

app.get('/api/search', (req, res) => {
  const query = normalizeText(req.query.q);

  if (!query) {
    console.warn('[Route] Search requested without a query.');
    return res.status(400).json({
      message: 'Query parameter "q" is required.',
    });
  }

  const lipsticks = loadLipsticksData();
  const results = lipsticks.filter((product) => {
    const brand = normalizeText(product.brand);
    const shadeName = normalizeText(getShadeName(product));

    return brand.includes(query) || shadeName.includes(query);
  });

  console.log(`[Route] Search for "${query}" returned ${results.length} result(s).`);
  return sendCollectionResponse(res, results, `No lipstick products found for "${query}".`);
});

app.get('/api/filter', (req, res) => {
  const filters = {
    color_family: normalizeText(req.query.color_family),
    finish: normalizeText(req.query.finish),
    brand: normalizeText(req.query.brand),
  };

  const activeFilters = Object.entries(filters).filter(([, value]) => value);

  if (!activeFilters.length) {
    console.warn('[Route] Filter requested without query parameters.');
    return res.status(400).json({
      message: 'Provide at least one filter: color_family, finish, or brand.',
    });
  }

  const lipsticks = loadLipsticksData();
  const filteredProducts = lipsticks.filter((product) =>
    activeFilters.every(([key, value]) => normalizeText(product[key]) === value)
  );

  console.log(
    `[Route] Filter ${JSON.stringify(Object.fromEntries(activeFilters))} returned ${filteredProducts.length} result(s).`
  );

  return sendCollectionResponse(res, filteredProducts, 'No lipstick products matched the provided filters.');
});

app.get('/api/recommend', (req, res) => {
  const undertone = normalizeText(req.query.undertone);

  // Validate required parameter: undertone
  if (!undertone) {
    console.warn('[Route] Recommendation requested without an undertone.');
    return res.status(400).json({
      message: 'Query parameter "undertone" is required. Use warm, cool, or neutral.',
    });
  }

  // Validate undertone value
  if (!VALID_UNDERTONES.has(undertone)) {
    console.warn(`[Route] Invalid undertone received: ${undertone}`);
    return res.status(400).json({
      message: 'Invalid undertone. Allowed values: warm, cool, neutral.',
    });
  }

  // Get optional preference parameters
  const userPreferences = {
    undertone,
    color_family: normalizeText(req.query.color_family) || null,
    finish: normalizeText(req.query.finish) || null,
  };

  const lipsticks = loadLipsticksData();

  // Calculate scores for all products and filter out zero-score items
  const scoredProducts = lipsticks
    .map((product) => {
      const score = calculateRecommendationScore(product, userPreferences);
      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .map(({ product, score }) => enhanceProductWithScore(product, score))
    .sort((a, b) => b.score - a.score);

  // Log recommendation details
  const appliedFilters = [
    `undertone="${undertone}"`,
    userPreferences.color_family && `color_family="${userPreferences.color_family}"`,
    userPreferences.finish && `finish="${userPreferences.finish}"`,
  ]
    .filter(Boolean)
    .join(', ');

  console.log(
    `[Route] Recommendation with filters [${appliedFilters}] returned ${scoredProducts.length} result(s).`
  );

  return sendCollectionResponse(
    res,
    scoredProducts,
    `No lipstick products found matching the preferences: ${appliedFilters}.`
  );
});

app.get('/api/product/:id', (req, res) => {
  const requestedId = normalizeText(req.params.id);
  const lipsticks = loadLipsticksData();
  const product = lipsticks.find((item) => normalizeText(item.id) === requestedId);

  if (!product) {
    console.warn(`[Route] Product not found for id "${req.params.id}".`);
    return res.status(404).json({
      message: `Product with id "${req.params.id}" not found.`,
    });
  }

  console.log(`[Route] Product found for id "${req.params.id}".`);
  return res.status(200).json(product);
});

app.use((req, res) => {
  console.warn(`[Route] Unknown route requested: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    message: 'Route not found.',
  });
});

app.use((error, req, res, next) => {
  console.error(`[Server] Unhandled error: ${error.stack || error.message}`);
  res.status(500).json({
    message: 'Internal server error.',
  });
});

const initialData = loadLipsticksData();
console.log(`[Startup] Data file path: ${DATA_FILE_PATH}`);
console.log(`[Startup] Loaded ${initialData.length} lipstick product(s) at startup.`);

app.listen(PORT, () => {
  console.log(`[Startup] Lipshade backend is running on http://localhost:${PORT}`);
});
