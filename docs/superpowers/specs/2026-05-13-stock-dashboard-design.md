# Stock Dashboard Design

## Goal

Improve the stock pages into inventory dashboards with filters, KPIs, visual stock status, clearer movement history, CSV exports, and less duplicated movement code.

## Requirements

- Preserve `/stock` and `/stock/merchandising`.
- Add filters for area, category, stock status, search, movement type, and movement date range.
- Show KPI cards for products, low stock, out of stock, total units, and estimated stock value.
- Add CSS-only visual sections for stock status, low-stock ranking, and movement type totals.
- Improve product and movement tables with clearer labels and export links.
- Add CSV exports for product stock and movement history.
- Refactor duplicated movement POST handlers through one shared function.

## Architecture

Add stock filter/query helpers in `src/services/report-utils.js`. Extend the existing stock route rendering flow in `src/server.js` with a shared `renderStock` function and shared `handleStockMovement` function. Keep EJS in `src/views/stock.ejs` and reuse existing CSS chart components.

## Testing

Add unit tests for stock filter normalization and query serialization. Verify with `npm test` and `npm run check`.
