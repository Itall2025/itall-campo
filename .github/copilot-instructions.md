# Itall Campo – AI Coding Agent Instructions

## Project Overview
**Itall Campo** is a Node.js + Express backend with a single-file vanilla JS frontend for generating quotations and managing inventory, tightly integrated with the OMIE ERP API. The system fetches inventory and product images, supports real-time product search, cart management, PDF export, and WhatsApp sharing.

## Architecture & Data Flow
- **Backend** ([server.js](server.js)): Express server, OMIE API integration, 60s in-memory cache, all API logic.
- **Frontend** ([index.html](index.html)): All UI, state, and logic in one file. Uses Tailwind CSS, jsPDF (CDN), and vanilla JS.
- **Data Flow**: Frontend POSTs to `/api/estoque` → backend fetches/paginates OMIE inventory & images → caches for 60s → returns transformed product list to frontend.
- **Cart**: Managed in JS object in memory; lost on refresh.

## Developer Workflows
- **Dev server**: `npm run dev` (auto-restarts, port 3000)
- **Production**: `npm start` (uses `$PORT` or 3000)
- **Debugging**: Console logs use emoji prefixes (`📦`, `📸`, `✅`, `❌`). Check `cacheEstoque` for cache issues.

## Key Patterns & Conventions
- **OMIE API**: Credentials in `CONFIG` (hardcoded, not secure). Inventory and product images fetched via paginated POSTs. Product code mapping uses `cCodigo` and `codigo_produto[_integracao]`.
- **Caching**: 60s global cache; if OMIE fails but cache exists, returns expired cache. No per-user cache.
- **Frontend**: All logic in `index.html`. Product list and cart are JS objects; UI re-renders on every search or cart change. No frameworks or state libraries.
- **Image Handling**: Product images mapped by code; fallback to "SEM FOTO" if missing/broken.
- **PDF/WhatsApp**: PDF via jsPDF + autotable (CDN). WhatsApp share builds URL-encoded message.

## Integration Points
- **OMIE Endpoints**: `/v1/estoque/consulta/` (inventory), `/v1/geral/produtos/` (images/info).
- **CNPJ Lookup**: `/api/cnpj/{cnpj}` called in frontend but not implemented in backend (will fail silently).

## Project-Specific Gotchas
- **Field names**: OMIE API field names are inconsistent; see mapping logic in backend.
- **Image mapping**: Relies on code match; OMIE changes may break images.
- **No error recovery**: If OMIE fails and cache is expired, frontend may show stale or empty data.
- **Credentials**: Hardcoded in both backend and frontend; replace with env vars for production.

## Examples
- **Add API endpoint**: See pattern in [server.js](server.js) for POST handlers (use `fetch`, 30s timeout, emoji logs).
- **Modify product display**: Edit `render()` in [index.html](index.html); update mapping in `sincronizar()` for new fields.
- **Extend cart logic**: Update `carrinho` object and related functions in [index.html](index.html).

## Testing & Debugging
- No automated tests. Test OMIE with `/api/test`. Use emoji logs for tracing. Manual browser testing only.
