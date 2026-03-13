# SOLUTION.md — Secondary Marketplace

📹 **Video Recording:**  
[Watch the project walkthrough](https://drive.google.com/drive/folders/1xLC_3xl5_z51aDmTjOCCF9LUk-VE6k-t?usp=drive_link)

## What I Built

I took the starter code (placeholder wireframes + a provided matching engine) and built out a functional secondary marketplace where users can browse digital security assets, place buy/sell orders, manage open orders, and track their portfolio — all wired end-to-end from the frontend through custom API routes down to the SQLite database.

### 1. Trading API Routes (Backend)

**`POST /api/trading/orders`** — Place a buy or sell order.
- Validates all inputs: symbol must exist in the asset catalog, side must be `buy` or `sell`, quantity must be a positive integer, price must be positive, and `timeInForce` must be one of `day`, `gtd`, or `gtc`.
- For **buy orders**: checks the user's cash balance, deducts the full order cost upfront (reserve model), then passes the order to the matching engine. When a match occurs on the buy side, the counterparty seller's balance is credited with trade proceeds.
- For **sell orders**: checks the user holds enough shares of the given symbol, then passes the order to the matching engine. When a match occurs, the seller's balance is credited based on actual fill prices from the `trading_trades` table.
- Returns order status (`Pending`, `PartiallyFilled`, or `Completed`) and remaining quantity.

**`DELETE /api/trading/orders/[id]`** — Cancel an open order.
- Only allows cancellation of orders with status `New`, `Pending`, or `PartiallyFilled`.
- For buy orders, refunds the reserved cash (`remaining_quantity × price`) back to the user's trading balance.
- Ownership check ensures users can only cancel their own orders.

**`GET /api/trading/orders`** — Fetch user's orders, with optional `?symbol=` and `?status=` filters.

**`GET /api/trading/holdings`** — Fetch user's share positions, with optional `?symbol=` filter.

**`GET /api/trading/balance`** — Fetch user's trading cash balance.

**`GET /api/trading/assets/[id]`** — Fetch a single asset's detail including a computed order book (template `priceMultiplier × basePrice`) and market history.

**Enhanced `GET /api/trading/assets`** — Added server-side search (by name/symbol), category filtering, and multi-field sorting (price, change %, name) to the existing starter endpoint.

### 2. Asset Listing Page (`/investing/secondary-trading`)

Replaced the placeholder wireframe with a fully functional marketplace page:
- **Search**: debounced text input (300ms) that filters assets by name or symbol via the API.
- **Category chips**: filter by sector (tech, healthcare, finance, energy, consumer).
- **Sort dropdown**: price high/low, change high/low, name A-Z/Z-A.
- **Asset cards**: each card shows a symbol badge with seeded color, 14-day SVG sparkline, current price, percent change, volume, market cap, and bid/ask spread.
- **Loading skeletons**: MUI `Skeleton` components shown while data loads.
- **Empty state**: friendly message when no assets match filters.
- Clicking a card navigates to the detail page.

### 3. Asset Detail Page (`/investing/secondary-trading/[id]`)

Built from scratch (the original was an empty wireframe). ~1,000 lines covering:

- **Price chart**: custom SVG line chart with gradient fill, Y-axis labels, X-axis date labels, and a current-price dot. Built using the `buildSecondaryTradingDailyHistory` utility from the provided helpers.
- **Order book**: visual depth display with asks (red) and bids (green), background bars sized proportionally to order size, and a spread indicator between the two sides.
- **Key statistics panel**: market cap, avg volume, 52-week range, P/E ratio, dividend yield, revenue, revenue growth, net income — all pulled from the asset's JSON data.
- **Company info section**: description, founded year, headquarters, employees, sector.
- **Order placement form** (sticky right column):
  - Buy/sell toggle with color-coded UI (green for buy, red for sell).
  - Quantity and price inputs with quick-price buttons (bid, current, ask).
  - Real-time order total calculation.
  - Inline validation: insufficient funds warning for buys, insufficient shares warning for sells.
  - Confirmation dialog before submitting.
  - Snackbar notifications for success/error feedback.
- **User's positions**: displays current shares held, average cost, market value, and unrealized P&L.
- **Open orders table**: shows all pending/partially-filled orders with a cancel button per row.
- **Order history table**: completed and cancelled orders with status chips.
- All user data (balance, holdings, orders) fetched in parallel via `Promise.all` and refreshed after every order action.

### 4. Portfolio Integration (`components/portfolio/CashBalance.tsx`)

Extended the existing portfolio component to incorporate trading data:
- Fetches trading balance and holdings alongside existing banking/investment data.
- Calculates trading holdings market value using current asset prices.
- Adds trading value to the total portfolio value.
- **Trading Holdings section**: expandable panel showing each held symbol with a color-coded badge, share count, average cost, market value, and P&L (both dollar and percentage). Each row is clickable and navigates to the asset's detail page.
- Displays trading cash balance in the section header.


---

## Key Technical Decisions & Trade-offs

### Cash reservation model for buy orders
When a user places a buy order, the full cost is deducted from their balance immediately — not when a match occurs. This prevents overspending when multiple orders are placed before any fill. The reserved amount is refunded on cancellation. Trade-off: the user's available balance appears lower while orders are open, but it's a safer model that real brokerages use.

### Seller proceeds credited post-match
Sell order proceeds are calculated from actual `trading_trades` records rather than the order's limit price. This handles partial fills correctly — if 5 of 10 shares fill at $3.09, the seller gets exactly $15.45 credited, not an estimate.

### Counterparty balance updates in the API route
When a buy order matches, I credit the counterparty seller's balance in the same API handler. This keeps the flow explicit and readable. Trade-off: the matching engine itself (`matchOrder`) only handles order status and holdings — balance transfers are the API route's responsibility. This split means the logic isn't fully atomic in one place, but it keeps the provided matching engine unmodified.

### SVG-based charts instead of a charting library
I built the price chart and sparklines as raw SVG rather than pulling in Recharts or Chart.js. This keeps the bundle smaller and avoids dependency issues. Trade-off: less interactive (no hover tooltips, no zoom), but sufficient for the assignment scope.

### Debounced search with server-side filtering
Search calls the API with a 300ms debounce rather than filtering client-side. This pattern scales better if the asset catalog grows, but for 5 assets it's arguably overkill. I chose it to demonstrate awareness of real-world patterns.

### Did not modify the auth flow or matching engine
As instructed, I left authentication and the matching engine untouched. All new code layers on top of the provided infrastructure.

---

## What I'd Improve With More Time

- **WebSocket or polling for live order updates** — currently the user must manually refresh or place an order to see updated data. Real-time order book and fill notifications would significantly improve the trading UX.
- **Proper transaction wrapping** — the balance credit for counterparty sellers and the matching engine call should ideally be in a single database transaction to prevent inconsistent state on failure.
- - **Price improvement refund for buy orders** — when a buy order fills at a price lower than the limit price (e.g., buyer limits at $10 but matches a $5 sell), the matching engine executes at the seller's price ($5), which is correct. However, the buyer's balance was reserved at their limit price ($100 total), while the actual cost was only $50. The $50 surplus was not being refunded for completed orders. Added post-match reconciliation that calculates actual fill cost from the `trading_trades` table and refunds the difference back to the buyer's balance.
- **Unit and integration tests** — I wrote a test file (`trading.test.ts`) covering validation, balance checks, matching, and cancellation logic, but these test the logic in isolation. Full API route integration tests with supertest/fetch would be more robust.
- **Limit order expiration** — `time_in_force: 'day'` and `gtd` orders should auto-expire. A cron job or scheduled task would handle this.
- **Responsive design polish** — the layout works on mobile but could use more breakpoint-specific adjustments, especially the order form and order book.
- **Accessibility** — add proper ARIA labels, keyboard navigation for the order book, and screen-reader-friendly status announcements.
- **Optimistic UI updates** — update the order list and balance immediately on action, then reconcile with the server response, for a snappier feel.


- **to run the test cases use**: npm test 
