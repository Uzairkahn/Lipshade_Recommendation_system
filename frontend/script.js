const API_BASE = 'http://localhost:3000/api';

const state = {
  allProducts: [],
  visibleProducts: [],
  searchTerm: '',
  undertone: '',
  filters: {
    color_family: '',
    finish: '',
    brand: '',
  },
  searchTimer: null,
  requestToken: 0,
};

const elements = {
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  colorFilter: document.getElementById('colorFilter'),
  finishFilter: document.getElementById('finishFilter'),
  brandFilter: document.getElementById('brandFilter'),
  toneButtons: Array.from(document.querySelectorAll('.tone-button')),
  clearAllBtn: document.getElementById('clearAllBtn'),
  activeTags: document.getElementById('activeTags'),
  productsGrid: document.getElementById('productsGrid'),
  feedback: document.getElementById('feedback'),
  statusMessage: document.getElementById('statusMessage'),
  resultCount: document.getElementById('resultCount'),
  activeMode: document.getElementById('activeMode'),
  modal: document.getElementById('productModal'),
  modalContent: document.getElementById('modalContent'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  await loadInitialCatalog();
}

function bindEvents() {
  elements.searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.searchTerm = elements.searchInput.value.trim();
    await refreshCatalog();
  });

  elements.searchInput.addEventListener('input', () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(async () => {
      state.searchTerm = elements.searchInput.value.trim();
      await refreshCatalog();
    }, 260);
  });

  [elements.colorFilter, elements.finishFilter, elements.brandFilter].forEach((selectElement) => {
    selectElement.addEventListener('change', async () => {
      state.filters = getFilterValues();
      await refreshCatalog();
    });
  });

  elements.toneButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const selectedTone = button.dataset.undertone;
      state.undertone = state.undertone === selectedTone ? '' : selectedTone;
      syncToneButtons();
      await refreshCatalog();
    });
  });

  elements.clearAllBtn.addEventListener('click', async () => {
    resetControls();
    await refreshCatalog();
  });

  elements.productsGrid.addEventListener('click', async (event) => {
    const cardTrigger = event.target.closest('[data-product-id]');

    if (!cardTrigger) {
      return;
    }

    const productId = cardTrigger.dataset.productId;
    await openProductDetail(productId);
  });

  elements.productsGrid.addEventListener('keydown', async (event) => {
    const cardTrigger = event.target.closest('[data-product-id]');

    if (!cardTrigger || !['Enter', ' '].includes(event.key)) {
      return;
    }

    event.preventDefault();
    await openProductDetail(cardTrigger.dataset.productId);
  });

  elements.modalCloseBtn.addEventListener('click', closeModal);

  elements.modal.addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-close-modal')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  // Prevent body scroll when modal is open
  function preventScroll(e) {
    e.preventDefault();
  }
}

async function loadInitialCatalog() {
  setFeedback('Loading lipstick catalog...');

  try {
    const payload = await fetchJson(`${API_BASE}/lipsticks`);
    const products = extractCollection(payload);

    state.allProducts = products;
    populateBrandFilter(products);
    state.visibleProducts = products;

    clearFeedback();
    renderProducts(products);
    renderActiveTags();
    updateSummary(products.length);
    elements.statusMessage.textContent = 'Browse the full Lipshade catalog or refine the results with search, filters, and undertones.';
  } catch (error) {
    handleCatalogError(error);
  }
}

async function refreshCatalog() {
  state.filters = getFilterValues();
  setFeedback('Refreshing shades...');
  const requestId = ++state.requestToken;

  try {
    const payload = await fetchBaseCollection();

    if (requestId !== state.requestToken) {
      return;
    }

    const baseProducts = extractCollection(payload);
    const refinedProducts = applyClientState(baseProducts);

    state.visibleProducts = refinedProducts;

    clearFeedback();
    renderProducts(refinedProducts);
    renderActiveTags();
    updateSummary(refinedProducts.length);
    elements.statusMessage.textContent = buildStatusMessage(refinedProducts.length, payload.message);
  } catch (error) {
    if (requestId !== state.requestToken) {
      return;
    }

    handleCatalogError(error);
  }
}

async function fetchBaseCollection() {
  if (state.searchTerm) {
    const query = encodeURIComponent(state.searchTerm);
    return fetchJson(`${API_BASE}/search?q=${query}`);
  }

  if (hasActiveFilters()) {
    const params = new URLSearchParams();

    if (state.filters.color_family) {
      params.set('color_family', state.filters.color_family);
    }

    if (state.filters.finish) {
      params.set('finish', state.filters.finish);
    }

    if (state.filters.brand) {
      params.set('brand', state.filters.brand);
    }

    return fetchJson(`${API_BASE}/filter?${params.toString()}`);
  }

  if (state.undertone) {
    return fetchJson(`${API_BASE}/recommend?undertone=${encodeURIComponent(state.undertone)}`);
  }

  return fetchJson(`${API_BASE}/lipsticks`);
}

function applyClientState(products) {
  return products.filter((product) => {
    const searchMatch = !state.searchTerm || matchesSearch(product, state.searchTerm);
    const colorMatch = !state.filters.color_family || normalizeText(product.color_family) === state.filters.color_family;
    const finishMatch = !state.filters.finish || normalizeText(product.finish) === state.filters.finish;
    const brandMatch = !state.filters.brand || normalizeText(product.brand) === state.filters.brand;
    const undertoneMatch = !state.undertone || normalizeText(product.undertone) === state.undertone;

    return searchMatch && colorMatch && finishMatch && brandMatch && undertoneMatch;
  });
}

function renderProducts(products) {
  if (!products.length) {
    elements.productsGrid.innerHTML = `
      <article class="empty-state">
        <h3>No shades matched this combination.</h3>
        <p>Try clearing one filter, changing undertone, or searching for a different brand or shade name.</p>
      </article>
    `;
    return;
  }

  // Check if products have scores (smart ranking)
  const hasScores = products.length > 0 && 'score' in products[0];
  
  if (hasScores) {
    // Split into top 3 and remaining
    const topPicks = products.slice(0, 3);
    const remaining = products.slice(3);
    
    const topPicksHtml = `
      <section class="top-picks-section" role="region" aria-label="Top recommended shades">
        <div class="top-picks-header">
          <h2>✨ Top Picks for You</h2>
          <p>Handpicked recommendations based on your undertone profile</p>
        </div>
        <div class="top-picks-grid">
          ${topPicks
            .map((product, index) => {
              const animationDelay = `${Math.min(index * 55, 110)}ms`;
              return createProductCard(product, index, animationDelay, true);
            })
            .join('')}
        </div>
      </section>
    `;
    
    const remainingHtml = remaining.length > 0
      ? `
        <section class="remaining-products-section" role="region" aria-label="Additional product recommendations">
          <div class="remaining-header">
            <h3>More Great Matches</h3>
          </div>
          <div class="products-grid">
            ${remaining
              .map((product, index) => {
                const animationDelay = `${Math.min((index + 3) * 55, 440)}ms`;
                return createProductCard(product, index + 3, animationDelay, false);
              })
              .join('')}
          </div>
        </section>
      `
      : '';
    
    elements.productsGrid.innerHTML = topPicksHtml + remainingHtml;
  } else {
    // Regular grid display (no scores)
    elements.productsGrid.innerHTML = `
      <div class="products-grid">
        ${products
          .map((product, index) => {
            const animationDelay = `${Math.min(index * 55, 440)}ms`;
            return createProductCard(product, index, animationDelay, false);
          })
          .join('')}
      </div>
    `;
  }
}

function createProductCard(product, index, animationDelay, isTopPick) {
  const scoreHtml = product.score !== undefined 
    ? `<div class="match-score"><span class="score-label">Match:</span> <span class="score-value">${(product.score).toFixed(1)}</span></div>`
    : '';
  
  const badgeHtml = isTopPick
    ? `<div class="best-match-badge">
        <span class="badge-icon">⭐</span>
        <span class="badge-text">Best Match</span>
      </div>`
    : '';
  
  return `
    <article
      class="product-card ${isTopPick ? 'is-top-pick' : ''}"
      style="--delay: ${animationDelay}"
      data-product-id="${escapeHtml(product.id)}"
      tabindex="0"
      role="button"
      aria-label="View details for ${escapeHtml(product.brand)} ${escapeHtml(product.shade)}${isTopPick ? ' - Best Match' : ''}"
    >
      ${badgeHtml}
      <div class="card-visual" style="background-color: ${escapeHtml(product.hex)}">
        <span class="finish-pill">${escapeHtml(product.finish)}</span>
      </div>
      <div class="card-body">
        <p class="card-brand">${escapeHtml(product.brand)}</p>
        <h3 class="card-shade">${escapeHtml(product.shade)}</h3>
        <div class="card-meta">
          <span class="swatch-chip">
            <i class="swatch-dot" style="background-color: ${escapeHtml(product.hex)}"></i>
            ${escapeHtml(product.hex)}
          </span>
          <span class="undertone-chip ${escapeHtml(normalizeText(product.undertone))}">${escapeHtml(product.undertone)}</span>
        </div>
        ${scoreHtml}
        <button class="card-link" type="button" data-product-id="${escapeHtml(product.id)}">View details</button>
      </div>
    </article>
  `;
}

async function openProductDetail(productId) {
  openModal();
  renderModalLoading();

  try {
    const product = await fetchJson(`${API_BASE}/product/${encodeURIComponent(productId)}`);
    renderProductDetail(product);
  } catch (error) {
    renderModalError(error.message);
  }
}

function openModal() {
  elements.modal.classList.add('is-open');
  elements.modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeModal() {
  elements.modal.classList.remove('is-open');
  elements.modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function renderModalLoading() {
  const wrapper = createElement('div', { className: 'modal-loading' });
  const inner = createElement('div');
  const title = createElement('h3', { id: 'modalTitle', text: 'Loading shade details...' });
  const description = createElement('p', { text: 'Pulling the latest product details from the Lipshade API.' });

  inner.append(title, description);
  wrapper.appendChild(inner);
  replaceModalContent(wrapper);
}

function renderModalError(message) {
  const wrapper = createElement('div', { className: 'modal-error' });
  const inner = createElement('div');
  const title = createElement('h3', { id: 'modalTitle', text: 'Unable to load this shade' });
  const description = createElement('p', { text: message });

  inner.append(title, description);
  wrapper.appendChild(inner);
  replaceModalContent(wrapper);
}

function renderProductDetail(product) {
  const layout = createElement('div', { className: 'modal-layout' });
  const visual = createElement('div', { className: 'modal-visual' });
  const info = createElement('div', { className: 'modal-info' });
  const brand = createElement('p', { className: 'modal-brand', text: product.brand });
  const title = createElement('h3', { id: 'modalTitle', text: product.shade });
  const meta = createElement('div', { className: 'detail-meta' });
  const description = createElement('p', {
    className: 'detail-description',
    text: `This shade pairs a ${product.finish} finish with a ${product.undertone} undertone profile, making it a strong pick for anyone building a ${product.color_family} look.`,
  });
  const details = createElement('div', { className: 'detail-grid' });

  visual.style.backgroundColor = product.hex;
  visual.style.background = `
    linear-gradient(135deg, ${product.hex}dd, ${product.hex}99)
  `;

  meta.append(
    createDetailChip('Color', `${product.color_family} (${product.hex})`),
    createDetailChip('Undertone', product.undertone),
    createDetailChip('Finish', product.finish)
  );

  details.append(
    createDetailChip('Brand', product.brand),
    createDetailChip('Shade', product.shade),
    createDetailChip('Ingredients', product.ingredients),
    createDetailChip('Shade ID', product.id)
  );

  info.append(brand, title, meta, description, details);
  layout.append(visual, info);

  replaceModalContent(layout);
}

function createDetailChip(label, value) {
  const chip = createElement('div', { className: 'detail-chip' });
  const strong = createElement('strong', { text: label });
  const textNode = document.createTextNode(` ${value}`);

  chip.append(strong, textNode);
  return chip;
}

function replaceModalContent(node) {
  elements.modalContent.replaceChildren(node);
}

function populateBrandFilter(products) {
  const uniqueBrands = [...new Set(products.map((product) => product.brand))].sort((left, right) =>
    left.localeCompare(right)
  );

  const optionsMarkup = uniqueBrands
    .map((brand) => `<option value="${escapeHtml(normalizeText(brand))}">${escapeHtml(brand)}</option>`)
    .join('');

  elements.brandFilter.innerHTML = '<option value="">All brands</option>' + optionsMarkup;
}

function renderActiveTags() {
  const tags = [];

  if (state.searchTerm) {
    tags.push(`Search: ${state.searchTerm}`);
  }

  if (state.filters.color_family) {
    tags.push(`Color: ${state.filters.color_family}`);
  }

  if (state.filters.finish) {
    tags.push(`Finish: ${state.filters.finish}`);
  }

  if (state.filters.brand) {
    const matchingBrand = state.allProducts.find((product) => normalizeText(product.brand) === state.filters.brand);
    tags.push(`Brand: ${matchingBrand ? matchingBrand.brand : state.filters.brand}`);
  }

  if (state.undertone) {
    tags.push(`Undertone: ${state.undertone}`);
  }

  elements.activeTags.innerHTML = tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
}

function updateSummary(resultCount) {
  elements.resultCount.textContent = String(resultCount);
  elements.activeMode.textContent = buildModeLabel();
}

function buildModeLabel() {
  if (state.searchTerm) {
    return 'Search Results';
  }

  if (hasActiveFilters()) {
    return 'Filtered View';
  }

  if (state.undertone) {
    return 'Undertone Match';
  }

  return 'All Products';
}

function buildStatusMessage(resultCount, apiMessage = '') {
  if (!resultCount) {
    return 'No lipsticks match the current search and filter combination.';
  }

  if (state.searchTerm) {
    return `Showing ${resultCount} shade${resultCount === 1 ? '' : 's'} for "${state.searchTerm}".`;
  }

  if (state.undertone) {
    return `Showing ${resultCount} ${state.undertone} undertone recommendation${resultCount === 1 ? '' : 's'}.`;
  }

  if (hasActiveFilters()) {
    return `Showing ${resultCount} filtered product${resultCount === 1 ? '' : 's'}.`;
  }

  return apiMessage || `Showing all ${resultCount} lipsticks in the catalog.`;
}

function setFeedback(message, isError = false) {
  elements.feedback.hidden = false;
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('error', isError);
}

function clearFeedback() {
  elements.feedback.hidden = true;
  elements.feedback.textContent = '';
  elements.feedback.classList.remove('error');
}

function handleCatalogError(error) {
  state.visibleProducts = [];
  renderProducts([]);
  renderActiveTags();
  updateSummary(0);
  elements.statusMessage.textContent = 'The catalog could not be loaded.';
  setFeedback(error.message, true);
}

function resetControls() {
  state.searchTerm = '';
  state.undertone = '';
  state.filters = {
    color_family: '',
    finish: '',
    brand: '',
  };

  elements.searchInput.value = '';
  elements.colorFilter.value = '';
  elements.finishFilter.value = '';
  elements.brandFilter.value = '';
  syncToneButtons();
}

function syncToneButtons() {
  elements.toneButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.undertone === state.undertone);
  });
}

function getFilterValues() {
  return {
    color_family: normalizeText(elements.colorFilter.value),
    finish: normalizeText(elements.finishFilter.value),
    brand: normalizeText(elements.brandFilter.value),
  };
}

function hasActiveFilters() {
  return Object.values(state.filters).some(Boolean);
}

function matchesSearch(product, term) {
  const query = normalizeText(term);
  const brand = normalizeText(product.brand);
  const shade = normalizeText(product.shade);

  return brand.includes(query) || shade.includes(query);
}

function extractCollection(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

async function fetchJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') || '';

  let payload;

  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const errorMessage = payload && payload.message ? payload.message : 'The API request failed.';
    throw new Error(errorMessage);
  }

  return payload;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.id) {
    element.id = options.id;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  return element;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
