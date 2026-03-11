
/**
 * ASSET DETAIL PAGE - Secondary Trading
 *
 * Build this page to show asset details and allow order placement.
 * You'll also need to build the trading API routes that this page calls.
 *
 * Available: lib/matchingEngine.ts — order matching engine (matchOrder, upsertHolding)
 * Data: import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'
 *   - Each asset has dailyHistory (30 OHLCV candles) and company info
 *   - Order book: templates.orderBook.asks/bids — multiply priceMultiplier × asset.basePrice
 */
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  Grid,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Divider,
  Tooltip,
  IconButton,
  LinearProgress,
  Skeleton,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  ArrowBack,
  TrendingUp,
  TrendingDown,
  Cancel,
  CheckCircle,
  Info,
  AccountBalance,
  ShoppingCart,
  Sell,
  Refresh,
} from '@mui/icons-material'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatCurrency,
  getSecondaryTradingSymbol,
  slugify,
  getSeededColor,
  getCategoryLabel,
  buildSecondaryTradingDailyHistory,
} from '@/lib/investmentUtils'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'
import api from '@/lib/api'

// ─── Simple Price Chart ───────────────────────────────────────

function PriceChart({ data, width = 700, height = 280 }: { data: { date: string; close: number; volume: number }[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null

  const prices = data.map((d) => d.close)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const padding = { top: 20, bottom: 30, left: 60, right: 20 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW
    const y = padding.top + chartH - ((d.close - min) / range) * chartH
    return { x, y, ...d }
  })

  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ')
  const areaPath = linePath + ` L ${points[points.length - 1].x},${padding.top + chartH} L ${points[0].x},${padding.top + chartH} Z`

  const isPositive = prices[prices.length - 1] >= prices[0]
  const color = isPositive ? '#00FF88' : '#ff4d4d'

  // Y-axis labels
  const yLabels = [min, min + range * 0.25, min + range * 0.5, min + range * 0.75, max]

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {/* Grid lines */}
      {yLabels.map((v, i) => {
        const y = padding.top + chartH - ((v - min) / range) * chartH
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="4,4" />
            <text x={padding.left - 8} y={y + 4} fill="#555" fontSize="11" textAnchor="end">
              ${v.toFixed(2)}
            </text>
          </g>
        )
      })}

      {/* X-axis labels */}
      {data.filter((_, i) => i % 5 === 0).map((d, i) => {
        const idx = data.indexOf(d)
        const x = padding.left + (idx / (data.length - 1)) * chartW
        return (
          <text key={i} x={x} y={height - 5} fill="#555" fontSize="10" textAnchor="middle">
            {d.date.slice(5)}
          </text>
        )
      })}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#chartGrad-${isPositive ? 'up' : 'down'})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

      {/* Gradient definitions */}
      <defs>
        <linearGradient id="chartGrad-up" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00FF88" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#00FF88" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="chartGrad-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff4d4d" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#ff4d4d" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Current price dot */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={color} />
    </svg>
  )
}

// ─── Order Book Component ─────────────────────────────────────

function OrderBook({ asks, bids }: { asks: { price: number; size: number }[]; bids: { price: number; size: number }[] }) {
  const maxSize = Math.max(
    ...asks.map((a) => a.size),
    ...bids.map((b) => b.size)
  )

  return (
    <Box>
      <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px', mb: 1.5 }}>
        Order Book
      </Typography>

      {/* Asks (sell orders) — shown in reverse so lowest ask is near the middle */}
      <Box sx={{ mb: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>Price</Typography>
          <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>Size</Typography>
        </Box>
        {[...asks].reverse().map((ask, i) => (
          <Box key={`ask-${i}`} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.3, position: 'relative' }}>
            <Box
              sx={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: `${(ask.size / maxSize) * 100}%`,
                backgroundColor: 'rgba(255, 77, 77, 0.08)',
                borderRadius: '2px',
              }}
            />
            <Typography sx={{ color: '#ff4d4d', fontSize: '13px', fontFamily: 'monospace', zIndex: 1 }}>
              ${ask.price.toFixed(4)}
            </Typography>
            <Typography sx={{ color: '#aaa', fontSize: '13px', fontFamily: 'monospace', zIndex: 1 }}>
              {ask.size.toLocaleString()}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Spread indicator */}
      <Box sx={{ py: 0.8, my: 0.5, borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
        <Typography sx={{ color: '#888', fontSize: '11px' }}>
          Spread: ${(asks.length > 0 && bids.length > 0 ? Math.abs(asks[asks.length - 1].price - bids[0].price) : 0).toFixed(4)}
        </Typography>
      </Box>

      {/* Bids (buy orders) */}
      <Box>
        {bids.map((bid, i) => (
          <Box key={`bid-${i}`} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.3, position: 'relative' }}>
            <Box
              sx={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: `${(bid.size / maxSize) * 100}%`,
                backgroundColor: 'rgba(0, 255, 136, 0.08)',
                borderRadius: '2px',
              }}
            />
            <Typography sx={{ color: '#00FF88', fontSize: '13px', fontFamily: 'monospace', zIndex: 1 }}>
              ${bid.price.toFixed(4)}
            </Typography>
            <Typography sx={{ color: '#aaa', fontSize: '13px', fontFamily: 'monospace', zIndex: 1 }}>
              {bid.size.toLocaleString()}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ─── Main Detail Page ─────────────────────────────────────────

export default function SecondaryTradingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const theme = useTheme()
  const { user, isAuthenticated } = useAuth()

  const investmentSlug = Array.isArray(params.id) ? params.id[0] : (params.id || '')
  const decodedSlug = investmentSlug ? decodeURIComponent(investmentSlug) : ''
  const allAssets = secondaryTradingAssets.investments as any[]
  const templates = secondaryTradingAssets.templates as any

  // Match by id, slugified title, or symbol (case-insensitive)
  const asset = allAssets.find(
    (a) =>
      a.id === decodedSlug ||
      slugify(a.title) === decodedSlug ||
      a.id === decodedSlug.toLowerCase() ||
      (a.symbol && a.symbol.toLowerCase() === decodedSlug.toLowerCase())
  )

  // If params haven't loaded yet, show loading
  if (!params.id) {
    return (
      <Box sx={{ minHeight: '100vh' }}>
        <Header />
        <Container maxWidth="lg" sx={{ pt: '120px', textAlign: 'center' }}>
          <CircularProgress sx={{ color: '#00FF88' }} />
        </Container>
      </Box>
    )
  }

  // Order form state
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [orderSuccess, setOrderSuccess] = useState('')

  // User data
  const [balance, setBalance] = useState<number>(0)
  const [holdings, setHoldings] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Tabs
  const [detailTab, setDetailTab] = useState(0) // 0 = Orders, 1 = Positions, 2 = Trades

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })

  const symbol = asset ? getSecondaryTradingSymbol(asset.title, asset.symbol) : ''

  // Build chart data
  const dailyHistory = useMemo(() => {
    if (!asset) return []
    return buildSecondaryTradingDailyHistory(asset.basePrice, symbol, templates.dailyHistory)
  }, [asset, symbol, templates.dailyHistory])

  // Build order book
  const orderBook = useMemo(() => {
    if (!asset) return { asks: [], bids: [] }
    return {
      asks: templates.orderBook.asks.map((entry: any) => ({
        price: Number((entry.priceMultiplier * asset.basePrice).toFixed(4)),
        size: entry.size,
      })),
      bids: templates.orderBook.bids.map((entry: any) => ({
        price: Number((entry.priceMultiplier * asset.basePrice).toFixed(4)),
        size: entry.size,
      })),
    }
  }, [asset, templates.orderBook])

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!isAuthenticated) {
      setDataLoading(false)
      return
    }
    try {
      const [balanceRes, holdingsRes, ordersRes] = await Promise.all([
        api.get('/trading/balance'),
        api.get(`/trading/holdings?symbol=${symbol}`),
        api.get(`/trading/orders?symbol=${symbol}`),
      ])
      setBalance(balanceRes.data.balance || 0)
      setHoldings(holdingsRes.data.holdings || [])
      setOrders(ordersRes.data.orders || [])
    } catch (err) {
      console.error('Error fetching user data:', err)
    } finally {
      setDataLoading(false)
    }
  }, [isAuthenticated, symbol])

  useEffect(() => {
    if (symbol) fetchUserData()
  }, [symbol, fetchUserData])

  // Set default price when asset loads
  useEffect(() => {
    if (asset && !price) {
      setPrice(asset.currentValue.toString())
    }
  }, [asset])

  if (!asset) {
    return (
      <Box sx={{ minHeight: '100vh' }}>
        <Header />
        <Container maxWidth="lg" sx={{ pt: '120px', textAlign: 'center' }}>
          <Typography variant="h5" sx={{ color: '#ffffff' }}>Asset not found</Typography>
          <Button onClick={() => router.push('/investing/secondary-trading')} sx={{ mt: 2, color: theme.palette.primary.main }}>
            Back to Marketplace
          </Button>
        </Container>
      </Box>
    )
  }

  const currentHolding = holdings.find((h) => h.symbol === symbol)
  const sharesHeld = currentHolding?.shares || 0
  const avgCost = currentHolding?.avg_cost || 0

  const openOrders = orders.filter((o) => ['New', 'Pending', 'PartiallyFilled'].includes(o.status))
  const completedOrders = orders.filter((o) => ['Completed', 'Filled', 'Cancelled'].includes(o.status))

  const orderTotal = Number(quantity || 0) * Number(price || 0)

  // Place order
  const handlePlaceOrder = async () => {
    setConfirmOpen(false)
    setOrderLoading(true)
    setOrderError('')
    setOrderSuccess('')

    try {
      const res = await api.post('/trading/orders', {
        symbol,
        side: orderSide,
        quantity: Number(quantity),
        price: Number(price),
        timeInForce: 'day',
      })

      const result = res.data
      setOrderSuccess(
        `Order placed! Status: ${result.order.status}` +
          (result.order.remaining > 0 ? ` (${result.order.remaining} remaining)` : '')
      )
      setSnackbar({ open: true, message: `${orderSide.toUpperCase()} order placed successfully!`, severity: 'success' })
      setQuantity('')
      fetchUserData()
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to place order'
      setOrderError(msg)
      setSnackbar({ open: true, message: msg, severity: 'error' })
    } finally {
      setOrderLoading(false)
    }
  }

  // Cancel order
  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.delete(`/trading/orders/${orderId}`)
      setSnackbar({ open: true, message: 'Order cancelled', severity: 'success' })
      fetchUserData()
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to cancel order', severity: 'error' })
    }
  }

  const paperSx = {
    p: 3,
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 2,
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Header />

      <Container maxWidth="lg" sx={{ pt: { xs: '100px', sm: '120px' }, pb: 4 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => router.push('/investing/secondary-trading')}
          sx={{ color: '#ffffff', mb: 2, textTransform: 'none', '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' } }}
        >
          Back to Marketplace
        </Button>

        {/* Asset Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '14px',
              background: `linear-gradient(135deg, ${getSeededColor(symbol)}, rgba(0,0,0,0.3))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: '#ffffff', fontWeight: 700, fontSize: '18px' }}>
              {symbol.slice(0, 2)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
              {asset.title}
            </Typography>
            <Typography sx={{ color: '#888888', fontSize: '14px' }}>
              {symbol} &bull; {getCategoryLabel(asset.category)} &bull; Founded {asset.founded}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mt: 2, mb: 4 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, color: '#ffffff' }}>
            {formatCurrency(asset.currentValue)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {asset.isPositive ? (
              <TrendingUp sx={{ fontSize: 20, color: theme.palette.primary.main }} />
            ) : (
              <TrendingDown sx={{ fontSize: 20, color: '#ff4d4d' }} />
            )}
            <Typography
              sx={{
                color: asset.isPositive ? theme.palette.primary.main : '#ff4d4d',
                fontWeight: 600,
                fontSize: '16px',
              }}
            >
              {asset.isPositive ? '+' : ''}
              {asset.performancePercent.toFixed(2)}%
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={3}>
          {/* ─── Left Column ─── */}
          <Grid item xs={12} md={8}>
            {/* Price Chart */}
            <Paper sx={{ ...paperSx, mb: 3 }}>
              <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px', mb: 2 }}>
                Price History (30 Days)
              </Typography>
              <PriceChart data={dailyHistory} />
            </Paper>

            {/* Key Stats */}
            <Paper sx={{ ...paperSx, mb: 3 }}>
              <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px', mb: 2 }}>
                Key Statistics
              </Typography>
              <Grid container spacing={2}>
                {[
                  { label: 'Market Cap', value: asset.marketCap },
                  { label: 'Avg Volume', value: asset.avgVolume },
                  { label: '52W Range', value: asset.priceRange },
                  { label: 'P/E Ratio', value: asset.peRatio?.toFixed(1) || 'N/A' },
                  { label: 'Dividend Yield', value: asset.dividendYield ? `${asset.dividendYield}%` : 'None' },
                  { label: 'Revenue', value: `$${asset.revenue}` },
                  { label: 'Revenue Growth', value: `${asset.revenueGrowth}%` },
                  { label: 'Net Income', value: `$${asset.netIncome}` },
                  { label: 'Employees', value: asset.employees?.toLocaleString() },
                  { label: 'Open', value: formatCurrency(asset.openPrice) },
                  { label: 'Bid', value: formatCurrency(asset.bid) },
                  { label: 'Ask', value: formatCurrency(asset.ask) },
                ].map((stat, i) => (
                  <Grid item xs={6} sm={4} md={3} key={i}>
                    <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase', mb: 0.3 }}>
                      {stat.label}
                    </Typography>
                    <Typography sx={{ color: '#ccc', fontSize: '14px', fontWeight: 500 }}>
                      {stat.value}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            {/* Order Book */}
            <Paper sx={{ ...paperSx, mb: 3 }}>
              <OrderBook asks={orderBook.asks} bids={orderBook.bids} />
            </Paper>

            {/* About */}
            <Paper sx={{ ...paperSx, mb: 3 }}>
              <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px', mb: 1 }}>
                About {asset.title}
              </Typography>
              <Typography sx={{ color: '#aaa', fontSize: '14px', lineHeight: 1.7 }}>
                {asset.companyDescription}
              </Typography>
            </Paper>

            {/* Orders & Positions */}
            {isAuthenticated && (
              <Paper sx={paperSx}>
                <Tabs
                  value={detailTab}
                  onChange={(_, v) => setDetailTab(v)}
                  sx={{
                    mb: 2,
                    '& .MuiTab-root': { color: '#888', textTransform: 'none', fontWeight: 500 },
                    '& .Mui-selected': { color: theme.palette.primary.main },
                    '& .MuiTabs-indicator': { backgroundColor: theme.palette.primary.main },
                  }}
                >
                  <Tab label={`Open Orders (${openOrders.length})`} />
                  <Tab label="Order History" />
                  <Tab label="Position" />
                </Tabs>

                {detailTab === 0 && (
                  <Box>
                    {openOrders.length === 0 ? (
                      <Typography sx={{ color: '#555', fontSize: '14px', py: 3, textAlign: 'center' }}>
                        No open orders for {symbol}
                      </Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Side</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Qty</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Price</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Remaining</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Status</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {openOrders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell sx={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                                  <Chip
                                    label={order.side.toUpperCase()}
                                    size="small"
                                    sx={{
                                      backgroundColor: order.side === 'buy' ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)',
                                      color: order.side === 'buy' ? '#00FF88' : '#ff4d4d',
                                      fontWeight: 600,
                                      fontSize: '11px',
                                    }}
                                  />
                                </TableCell>
                                <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.06)' }}>{order.quantity}</TableCell>
                                <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.06)' }}>{formatCurrency(order.price)}</TableCell>
                                <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.06)' }}>{order.remaining_quantity}</TableCell>
                                <TableCell sx={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                                  <Chip label={order.status} size="small" sx={{ fontSize: '11px', color: '#aaa', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                                </TableCell>
                                <TableCell sx={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                                  <IconButton size="small" onClick={() => handleCancelOrder(order.id)} sx={{ color: '#ff4d4d' }}>
                                    <Cancel fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                )}

                {detailTab === 1 && (
                  <Box>
                    {completedOrders.length === 0 ? (
                      <Typography sx={{ color: '#555', fontSize: '14px', py: 3, textAlign: 'center' }}>
                        No order history for {symbol}
                      </Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Side</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Qty</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Price</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Status</TableCell>
                              <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)' }}>Date</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {completedOrders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell sx={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                                  <Chip
                                    label={order.side.toUpperCase()}
                                    size="small"
                                    sx={{
                                      backgroundColor: order.side === 'buy' ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)',
                                      color: order.side === 'buy' ? '#00FF88' : '#ff4d4d',
                                      fontWeight: 600,
                                      fontSize: '11px',
                                    }}
                                  />
                                </TableCell>
                                <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.06)' }}>{order.quantity}</TableCell>
                                <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.06)' }}>{formatCurrency(order.price)}</TableCell>
                                <TableCell sx={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                                  <Chip
                                    label={order.status}
                                    size="small"
                                    sx={{
                                      fontSize: '11px',
                                      color: order.status === 'Completed' ? '#00FF88' : order.status === 'Cancelled' ? '#ff4d4d' : '#aaa',
                                      backgroundColor: order.status === 'Completed' ? 'rgba(0,255,136,0.1)' : order.status === 'Cancelled' ? 'rgba(255,77,77,0.1)' : 'rgba(255,255,255,0.05)',
                                    }}
                                  />
                                </TableCell>
                                <TableCell sx={{ color: '#888', fontSize: '12px', borderColor: 'rgba(255,255,255,0.06)' }}>
                                  {new Date(order.created_at).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                )}

                {detailTab === 2 && (
                  <Box>
                    {!currentHolding ? (
                      <Typography sx={{ color: '#555', fontSize: '14px', py: 3, textAlign: 'center' }}>
                        No position in {symbol}
                      </Typography>
                    ) : (
                      <Box sx={{ py: 2 }}>
                        <Grid container spacing={3}>
                          <Grid item xs={6} sm={3}>
                            <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase', mb: 0.5 }}>Shares</Typography>
                            <Typography sx={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>{sharesHeld}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase', mb: 0.5 }}>Avg Cost</Typography>
                            <Typography sx={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>{formatCurrency(avgCost)}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase', mb: 0.5 }}>Market Value</Typography>
                            <Typography sx={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>{formatCurrency(sharesHeld * asset.currentValue)}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={3}>
                            <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase', mb: 0.5 }}>P&L</Typography>
                            {(() => {
                              const pnl = (asset.currentValue - avgCost) * sharesHeld
                              const pnlPct = avgCost > 0 ? ((asset.currentValue - avgCost) / avgCost) * 100 : 0
                              return (
                                <Typography sx={{ color: pnl >= 0 ? '#00FF88' : '#ff4d4d', fontSize: '20px', fontWeight: 700 }}>
                                  {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} ({pnlPct.toFixed(1)}%)
                                </Typography>
                              )
                            })()}
                          </Grid>
                        </Grid>
                      </Box>
                    )}
                  </Box>
                )}
              </Paper>
            )}
          </Grid>

          {/* ─── Right Column: Order Form ─── */}
          <Grid item xs={12} md={4}>
            <Paper
              sx={{
                ...paperSx,
                position: { md: 'sticky' },
                top: { md: 100 },
              }}
            >
              {!isAuthenticated ? (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <AccountBalance sx={{ fontSize: 40, color: '#444', mb: 2 }} />
                  <Typography sx={{ color: '#fff', fontWeight: 600, mb: 1 }}>Sign in to Trade</Typography>
                  <Typography sx={{ color: '#888', fontSize: '14px', mb: 2 }}>
                    Create an account to start trading digital securities.
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={() => router.push('/auth')}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Sign In / Sign Up
                  </Button>
                </Box>
              ) : (
                <>
                  {/* Balance Info */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <Box>
                      <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>Cash Balance</Typography>
                      <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '16px' }}>{formatCurrency(balance)}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>Shares Held</Typography>
                      <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '16px' }}>{sharesHeld}</Typography>
                    </Box>
                  </Box>

                  {/* Buy/Sell Toggle */}
                  <ToggleButtonGroup
                    value={orderSide}
                    exclusive
                    onChange={(_, v) => v && setOrderSide(v)}
                    fullWidth
                    sx={{ mb: 2.5 }}
                  >
                    <ToggleButton
                      value="buy"
                      sx={{
                        color: orderSide === 'buy' ? '#000 !important' : '#888',
                        backgroundColor: orderSide === 'buy' ? '#00FF88 !important' : 'transparent',
                        borderColor: 'rgba(255,255,255,0.1)',
                        fontWeight: 600,
                        textTransform: 'none',
                        '&:hover': { backgroundColor: orderSide === 'buy' ? '#00E677' : 'rgba(255,255,255,0.05)' },
                      }}
                    >
                      <ShoppingCart sx={{ fontSize: 18, mr: 0.5 }} /> Buy
                    </ToggleButton>
                    <ToggleButton
                      value="sell"
                      sx={{
                        color: orderSide === 'sell' ? '#fff !important' : '#888',
                        backgroundColor: orderSide === 'sell' ? '#ff4d4d !important' : 'transparent',
                        borderColor: 'rgba(255,255,255,0.1)',
                        fontWeight: 600,
                        textTransform: 'none',
                        '&:hover': { backgroundColor: orderSide === 'sell' ? '#ff3333' : 'rgba(255,255,255,0.05)' },
                      }}
                    >
                      <Sell sx={{ fontSize: 18, mr: 0.5 }} /> Sell
                    </ToggleButton>
                  </ToggleButtonGroup>

                  {/* Quantity */}
                  <Typography sx={{ color: '#aaa', fontSize: '13px', mb: 0.5, fontWeight: 500 }}>
                    Quantity (shares)
                  </Typography>
                  <TextField
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    fullWidth
                    size="small"
                    sx={{
                      mb: 2,
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                        '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                      },
                      '& input': { color: '#fff', fontSize: '16px', fontWeight: 600 },
                    }}
                  />

                  {/* Price */}
                  <Typography sx={{ color: '#aaa', fontSize: '13px', mb: 0.5, fontWeight: 500 }}>
                    Limit Price ($)
                  </Typography>
                  <TextField
                    value={price}
                    onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    fullWidth
                    size="small"
                    sx={{
                      mb: 2,
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                        '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                      },
                      '& input': { color: '#fff', fontSize: '16px', fontWeight: 600 },
                    }}
                  />

                  {/* Quick price buttons */}
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                    {[asset.bid, asset.currentValue, asset.ask].map((p, i) => (
                      <Chip
                        key={i}
                        label={`$${p?.toFixed(2)}`}
                        size="small"
                        onClick={() => setPrice(p?.toString() || '')}
                        sx={{
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          color: '#aaa',
                          fontSize: '11px',
                          cursor: 'pointer',
                          '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                        }}
                      />
                    ))}
                  </Box>

                  {/* Order Summary */}
                  <Box
                    sx={{
                      p: 2,
                      mb: 2,
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ color: '#888', fontSize: '13px' }}>Estimated Total</Typography>
                      <Typography sx={{ color: '#fff', fontSize: '15px', fontWeight: 600 }}>
                        {formatCurrency(orderTotal)}
                      </Typography>
                    </Box>
                    {orderSide === 'buy' && orderTotal > balance && (
                      <Typography sx={{ color: '#ff4d4d', fontSize: '12px', mt: 0.5 }}>
                        Insufficient funds (need {formatCurrency(orderTotal - balance)} more)
                      </Typography>
                    )}
                    {orderSide === 'sell' && Number(quantity) > sharesHeld && (
                      <Typography sx={{ color: '#ff4d4d', fontSize: '12px', mt: 0.5 }}>
                        Insufficient shares (have {sharesHeld})
                      </Typography>
                    )}
                  </Box>

                  {/* Error/Success messages */}
                  {orderError && (
                    <Alert severity="error" sx={{ mb: 2, '& .MuiAlert-message': { fontSize: '13px' } }}>
                      {orderError}
                    </Alert>
                  )}
                  {orderSuccess && (
                    <Alert severity="success" sx={{ mb: 2, '& .MuiAlert-message': { fontSize: '13px' } }}>
                      {orderSuccess}
                    </Alert>
                  )}

                  {/* Submit Button */}
                  <Button
                    variant="contained"
                    fullWidth
                    disabled={
                      orderLoading ||
                      !quantity ||
                      !price ||
                      Number(quantity) <= 0 ||
                      Number(price) <= 0 ||
                      (orderSide === 'buy' && orderTotal > balance) ||
                      (orderSide === 'sell' && Number(quantity) > sharesHeld)
                    }
                    onClick={() => setConfirmOpen(true)}
                    sx={{
                      py: 1.5,
                      fontWeight: 700,
                      fontSize: '15px',
                      textTransform: 'none',
                      backgroundColor: orderSide === 'buy' ? '#00FF88' : '#ff4d4d',
                      color: orderSide === 'buy' ? '#000' : '#fff',
                      '&:hover': {
                        backgroundColor: orderSide === 'buy' ? '#00E677' : '#ff3333',
                      },
                      '&:disabled': {
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.3)',
                      },
                    }}
                  >
                    {orderLoading ? (
                      <CircularProgress size={22} sx={{ color: 'inherit' }} />
                    ) : (
                      `${orderSide === 'buy' ? 'Buy' : 'Sell'} ${symbol}`
                    )}
                  </Button>
                </>
              )}
            </Paper>
          </Grid>
        </Grid>

        {/* Confirm Dialog */}
        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          PaperProps={{
            sx: {
              backgroundColor: '#1b1b1b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              minWidth: 360,
            },
          }}
        >
          <DialogTitle sx={{ color: '#fff', fontWeight: 700, pb: 1 }}>
            Confirm {orderSide === 'buy' ? 'Buy' : 'Sell'} Order
          </DialogTitle>
          <DialogContent>
            <Box sx={{ py: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#888' }}>Asset</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>{symbol}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#888' }}>Side</Typography>
                <Chip
                  label={orderSide.toUpperCase()}
                  size="small"
                  sx={{
                    backgroundColor: orderSide === 'buy' ? 'rgba(0,255,136,0.15)' : 'rgba(255,77,77,0.15)',
                    color: orderSide === 'buy' ? '#00FF88' : '#ff4d4d',
                    fontWeight: 600,
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#888' }}>Quantity</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>{quantity} shares</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ color: '#888' }}>Price</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>{formatCurrency(Number(price))}</Typography>
              </Box>
              <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.08)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: '#fff', fontWeight: 600 }}>Total</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '18px' }}>{formatCurrency(orderTotal)}</Typography>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setConfirmOpen(false)} sx={{ color: '#888', textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handlePlaceOrder}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                backgroundColor: orderSide === 'buy' ? '#00FF88' : '#ff4d4d',
                color: orderSide === 'buy' ? '#000' : '#fff',
                '&:hover': {
                  backgroundColor: orderSide === 'buy' ? '#00E677' : '#ff3333',
                },
              }}
            >
              Confirm {orderSide === 'buy' ? 'Buy' : 'Sell'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  )
}