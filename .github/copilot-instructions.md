# Itall Campo - AI Coding Agent Instructions

## Project Overview
**Itall Campo** is a budgeting/quotation system for Itall Comércio that integrates with the OMIE ERP API to fetch inventory and generate quotations. It's a Node.js + Express backend serving a vanilla JavaScript frontend with real-time product search, cart management, PDF export, and WhatsApp integration.

## Architecture & Data Flow

### Tech Stack
- **Backend**: Node.js + Express 4.18 (ES6 modules)
- **Frontend**: Vanilla HTML/JS + Tailwind CSS 
- **Dependencies**: `cors`, `node-fetch` for external APIs
- **External API**: OMIE (Brazilian ERP) - requires API key/secret in `CONFIG`

### Key Data Flow
1. **Frontend (`index.html`)** → POST `/api/estoque` → **Backend (`server.js`)**
2. Server calls **OMIE API** → fetches paginated inventory + product images
3. Server **caches for 60 seconds** (prevent API throttling)
4. Frontend receives products, renders in grid, updates cart state
5. Cart → PDF via jsPDF or WhatsApp share

### Critical File Mapping
- **[server.js](server.js)**: Express server, OMIE API integration, caching logic
- **[index.html](index.html)**: Complete frontend (HTML + CSS + JS) - single file architecture
- **[package.json](package.json)**: Scripts: `npm start` (production), `npm run dev` (watch mode)

## Developer Workflows

### Local Development
```bash
npm run dev
# Runs with --watch flag, auto-restarts on file changes
# Server runs on http://localhost:3000
```

### Production
```bash
npm start
# Runs server without watch, uses $PORT env var (default 3000)
```

### Key Debugging Patterns
- Console logs use emoji prefixes for quick scanning (`📦 inventory`, `📸 images`, `✅ success`, `❌ error`)
- OMIE API responses logged for first item structure inspection
- Check `cacheEstoque` state when debugging stale data issues

## Critical Patterns & Conventions

### OMIE API Integration
- **Key constraint**: API credentials in hardcoded `CONFIG` object (security concern - use env vars in production)
- **Product code mapping**: Uses `cCodigo` for inventory, handles both `codigo_produto` and `codigo_produto_integracao` for image matching
- **Field names are inconsistent**: Inventory uses `nPrecoUnitario`, `cDescricao`, `nSaldo`; Product API uses different structure
- **Pagination**: Fetch all pages in loop (inventory can have 500+ items)
- **Timeout**: 30-second abort controller per request (OMIE can be slow)
- **Cache duration**: 60 seconds (1 minute) - hardcoded `CACHE_DURATION`

### Frontend State Management
- **Products array**: `[{id, nome, preco, foto, saldo}, ...]` - transformed from OMIE response
- **Cart object**: `{productId: quantity, ...}` - simple key-value store
- **No external state library** - relies on DOM updates and JavaScript objects
- **Render function**: Filters products by search term, rebuilds entire product list DOM

### Image Handling
- Primary source: OMIE product API response (`imagens[0].url_imagem`)
- Maps by code to inventory items via `mapaImagens` object
- Fallback on frontend: `onerror` shows "SEM FOTO" placeholder for broken images

### Cart & PDF Generation
- Cart stored in memory (lost on page refresh)
- PDF uses jsPDF library with autotable plugin
- WhatsApp share builds URL-encoded message string
- CNPJ lookup endpoint referenced but implementation incomplete in server.js

## Important Gotchas & Workarounds

### Known Issues
1. **CNPJ lookup**: Endpoint `/api/cnpj/{cnpj}` is called in frontend but NOT implemented in server.js - will fail silently
2. **Image mapping**: Relies on `cCodigo` matching - if OMIE API structure changes, images won't load
3. **No error recovery**: If OMIE API fails after cache expires and cart has products, generates PDF with stale prices
4. **Hard-coded credentials**: CONFIG keys visible in both server.js and index.html - replace with env vars

### Cache Behavior
- If fetch fails BUT cache exists: returns expired cache with fallback response
- No versioning - cache invalidation only by time, not by data changes
- Single global cache - all users share same cached inventory

## External Dependencies

### OMIE API Endpoints Used
- **POST** `/v1/estoque/consulta/` - `ListarPosEstoque` (inventory with stock levels)
- **POST** `/v1/geral/produtos/` - `ListarProdutos` (product info with images)

### Browser APIs
- `fetch()` - API calls
- `jsPDF` CDN - PDF generation
- `AbortController` - request timeout handling
- `localStorage` - available but not currently used

## Code Examples for Common Tasks

### Adding New API Endpoint
```javascript
// In server.js
app.post('/api/newfeature', async (req, res) => {
    try {
        const result = await fetch("https://app.omie.com.br/api/v1/...", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            signal: controller.signal,
            body: JSON.stringify({ "call": "YourCall", "app_key": CONFIG.key, ... })
        });
        res.json(result);
    } catch(err) { res.status(500).json({ erro: err.message }); }
});
```

### Modifying Product Display
- Edit card HTML in `render()` function in index.html (lines ~130-145)
- Update product object shape in `sincronizar()` map function if adding new fields

### Extending Cart Logic
- Modify `carrinho` object operations in `add()` and `updateQtd()` functions
- Total calculation duplicated - consolidate into separate function if modifying

## Testing Notes
- Manual testing only (no test suite)
- Test OMIE connection: curl `/api/test`
- Monitor console for emoji-prefixed logs during sync
