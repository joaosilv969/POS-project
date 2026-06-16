# Dues Report Analytics Design

## Goal

Improve `/reports/dues` into a dues analytics page with better filters, KPI cards, visual progress summaries, drilldown lists, and CSV exports.

## Requirements

- Preserve `/reports/dues` and its existing year/date behavior.
- Add filters for payment method, member payment status, and member search.
- Show KPI cards for active members, expected total, paid total, outstanding total, collection rate, paid/partial/unpaid members.
- Add CSS-only diagrams for collection progress, payment methods, monthly trend, and largest outstanding balances.
- Keep current tables but improve them into clear drilldowns: paid members, partial balances, unpaid members, recent payments.
- Add CSV exports for paid members, outstanding balances, unpaid members, payment methods, and monthly trend.
- Reuse existing styling patterns from the analytics workbench.

## Architecture

Add small dues report utilities for normalizing filters and serializing query strings. Keep SQL orchestration in `src/server.js` to match the current codebase. Extend `src/views/reports/dues.ejs` with the new view model and use the existing CSS chart classes.

## Error Handling

Invalid years fall back to the current year. Invalid dates, method ids, status values, and blank search values are ignored. Empty report sections render `Sem dados.`.

## Testing

Add unit tests for dues filter normalization and query serialization. Run `npm test` and `npm run check`.
