# Reports Analytics Workbench Design

## Goal

Turn `/reports` into a full analytics workbench with richer filters, KPI summaries, visual breakdowns, drilldown tables, and CSV exports while preserving existing report pages.

## Scope

The first implementation pass upgrades the general reports dashboard. Existing URLs remain valid:

- `/reports` becomes the main analytics workbench.
- `/reports/general` and `/reports/old` continue rendering the existing general report view.
- `/reports/merchandising` and `/reports/dues` remain available.

## Requirements

- Add global filters for date range, area, payment method, employee, and category.
- Add KPI cards for total revenue, sales count, items sold, average sale, cash total, and non-cash total.
- Add visual report sections using dependency-free CSS diagrams: trend bars, horizontal ranking bars, payment split bars, and stock alert bars.
- Add drilldown tables by day, product, employee, payment method, category, and low stock.
- Add query-preserving CSV exports for daily sales, product sales, payment totals, employee totals, and category totals.
- Keep the interface consistent with the current EJS/CSS system.
- Avoid introducing a chart dependency in this pass.

## Architecture

Add small report utility modules for filter normalization, query-string preservation, percentage calculations, and CSV rendering. Keep SQL execution in `src/server.js` for this pass so the change stays compatible with the current route structure.

The workbench route builds a normalized filter object, loads select options, runs aggregate SQL queries, computes view-model percentages, and renders `src/views/reports/workbench.ejs`.

## Data Flow

1. Request query is normalized into safe filter values.
2. SQL fragments are built for sales alias `s` and product alias `p`.
3. Aggregate queries fetch KPIs, trends, breakdowns, and stock alerts.
4. View-model helpers calculate chart widths and totals.
5. Export routes reuse the same filters and return CSV files.

## Error Handling

Invalid dates and unknown filter values are ignored. Empty report sections render `Sem dados.` rows. CSV exports return valid headers even when no rows match.

## Testing

Add tests for report filter normalization, query-string preservation, percentage calculations, and CSV escaping. Run `npm test` and `npm run check` after implementation.
