# Merchandising Report Analytics Design

## Goal

Improve `/reports/merchandising` into a merchandising analytics page with richer filters, KPI cards, visual summaries, drilldowns, and CSV exports.

## Requirements

- Preserve `/reports/merchandising`.
- Add filters for date range, category, member search, product search, payment method, and employee.
- Show KPI cards for revenue, sales count, items sold, average sale, unique buyers, and top product.
- Add CSS-only charts for daily trend, top products, top members, categories, and payment methods.
- Keep drilldowns for product totals, member totals, who bought what, recent merchandising sales, and low-stock merchandising products.
- Add CSV exports for products, members, member-product matrix, daily trend, recent sales, categories, and payment methods.
- Reuse existing analytics CSS components.

## Architecture

Add merchandising report filter helpers to `src/services/report-utils.js`. Extend the existing `/reports/merchandising` route in `src/server.js` and add `/reports/merchandising/export/:type`. Replace `src/views/reports/merchandising.ejs` with the richer analytics layout.

## Testing

Add unit tests for merchandising filter normalization and query serialization. Verify with `npm test` and `npm run check`.
