'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  TextField,
  InputAdornment,
  Chip,
  Select,
  MenuItem,
  FormControl,
  Skeleton,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  Search,
  TrendingUp,
  TrendingDown,
} from '@mui/icons-material'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import {
  formatCurrency,
  getSecondaryTradingSymbol,
  getSeededColor,
  getCategoryLabel,
  buildSecondaryTradingDailyHistory,
} from '@/lib/investmentUtils'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'

type Asset = {
  id: string
  title: string
  category: string
  basePrice: number
  previousValue: number
  currentValue: number
  openPrice: number
  performancePercent: number
  isPositive: boolean
  volume: string
  lastPrice: number
  bid: number
  ask: number
  high: number | null
  low: number | null
  companyDescription: string
  marketCap: string
  symbol?: string
  dailyHistory?: any[]
}

const categories = ['all', 'tech', 'healthcare', 'finance', 'energy', 'consumer']

const sortOptions = [
  { value: '', label: 'Default' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'change_desc', label: 'Change: High to Low' },
  { value: 'change_asc', label: 'Change: Low to High' },
  { value: 'name_asc', label: 'Name: A to Z' },
  { value: 'name_desc', label: 'Name: Z to A' },
]

// Simple sparkline component
function Sparkline({ data, isPositive, width = 120, height = 40 }: { data: number[]; isPositive: boolean; width?: number; height?: number }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? '#00FF88' : '#ff4d4d'}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function SecondaryTradingPage() {
  const router = useRouter()
  const theme = useTheme()
  const { user, isAuthenticated } = useAuth()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  const templates = secondaryTradingAssets.templates as any

  // Fetch assets from API whenever filters change
  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (category && category !== 'all') params.set('category', category)
        if (sort) params.set('sort', sort)

        const res = await api.get(`/trading/assets?${params.toString()}`)
        setAssets(res.data.assets || [])
      } catch (error) {
        console.error('Error fetching assets:', error)
      } finally {
        setLoading(false)
      }
    }

    // Small delay so we don't call API on every keystroke
    const timer = setTimeout(fetchAssets, 300)
    return () => clearTimeout(timer)
  }, [search, category, sort])

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Header />

      <Container maxWidth="lg" sx={{ pt: { xs: '100px', sm: '120px' }, pb: 4 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#ffffff', mb: 0.5 }}>
            Secondary Marketplace
          </Typography>
          <Typography sx={{ color: '#888888', fontSize: '15px' }}>
            Browse and trade digital securities on the secondary market
          </Typography>
        </Box>

        {/* Search & Filters */}
        <Paper
          sx={{
            p: 2.5,
            mb: 3,
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'center' } }}>
            {/* Search Input */}
            <TextField
              placeholder="Search by name or symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                },
                '& input': { color: '#fff', fontSize: '14px' },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: '#666', fontSize: 20 }} />
                  </InputAdornment>
                ),
              }}
            />

            {/* Sort Dropdown */}
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                displayEmpty
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                  '& .MuiSvgIcon-root': { color: '#888' },
                }}
              >
                {sortOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Category Chips */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={cat === 'all' ? 'All' : getCategoryLabel(cat)}
                onClick={() => setCategory(cat)}
                sx={{
                  backgroundColor:
                    category === cat
                      ? 'rgba(0, 255, 136, 0.15)'
                      : 'rgba(255,255,255,0.05)',
                  color: category === cat ? theme.palette.primary.main : '#aaa',
                  border:
                    category === cat
                      ? '1px solid rgba(0, 255, 136, 0.3)'
                      : '1px solid rgba(255,255,255,0.08)',
                  fontWeight: category === cat ? 600 : 400,
                  fontSize: '13px',
                  '&:hover': {
                    backgroundColor:
                      category === cat
                        ? 'rgba(0, 255, 136, 0.2)'
                        : 'rgba(255,255,255,0.08)',
                  },
                }}
              />
            ))}
          </Box>
        </Paper>

        {/* Results count */}
        {!loading && (
          <Typography sx={{ color: '#666', fontSize: '13px', mb: 2 }}>
            {assets.length} {assets.length === 1 ? 'asset' : 'assets'} found
          </Typography>
        )}

        {/* Loading Skeletons */}
        {loading && (
          <Grid container spacing={2}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Paper
                  sx={{
                    p: 2.5,
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Skeleton variant="rounded" width={40} height={40} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                    <Box sx={{ flex: 1 }}>
                      <Skeleton variant="text" width="70%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                      <Skeleton variant="text" width="40%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                    </Box>
                  </Box>
                  <Skeleton variant="rectangular" height={40} sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }} />
                  <Skeleton variant="text" width="50%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Asset Cards */}
        {!loading && (
          <Grid container spacing={2}>
            {assets.map((asset) => {
              const symbol = getSecondaryTradingSymbol(asset.title, asset.symbol)

              // Build sparkline data
              const dailyHistory = buildSecondaryTradingDailyHistory(
                asset.basePrice,
                symbol,
                templates.dailyHistory
              )
              const sparklineData = dailyHistory.slice(-14).map((d: any) => d.close)

              return (
                <Grid item xs={12} sm={6} md={4} key={asset.id}>
                  <Paper
                    onClick={() => router.push(`/investing/secondary-trading/${asset.id}`)}
                    sx={{
                      p: 2.5,
                      backgroundColor: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 2,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: 'rgba(0, 255, 136, 0.3)',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        transform: 'translateY(-2px)',
                      },
                    }}
                  >
                    {/* Header: Logo + Name */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            background: `linear-gradient(135deg, ${getSeededColor(symbol)}, rgba(0,0,0,0.3))`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}>
                            {symbol.slice(0, 2)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography sx={{ color: '#ffffff', fontWeight: 600, fontSize: '14px', lineHeight: 1.3 }}>
                            {asset.title}
                          </Typography>
                          <Typography sx={{ color: '#888', fontSize: '12px' }}>
                            {symbol} &bull; {getCategoryLabel(asset.category)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Sparkline */}
                    <Box sx={{ mb: 2, opacity: 0.8 }}>
                      <Sparkline data={sparklineData} isPositive={asset.isPositive} width={260} height={40} />
                    </Box>

                    {/* Price + Change */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}>
                      <Typography sx={{ color: '#ffffff', fontWeight: 700, fontSize: '20px' }}>
                        {formatCurrency(asset.currentValue)}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {asset.isPositive ? (
                          <TrendingUp sx={{ fontSize: 16, color: theme.palette.primary.main }} />
                        ) : (
                          <TrendingDown sx={{ fontSize: 16, color: '#ff4d4d' }} />
                        )}
                        <Typography
                          sx={{
                            color: asset.isPositive ? theme.palette.primary.main : '#ff4d4d',
                            fontWeight: 600,
                            fontSize: '13px',
                          }}
                        >
                          {asset.isPositive ? '+' : ''}
                          {asset.performancePercent.toFixed(2)}%
                        </Typography>
                      </Box>
                    </Box>

                    {/* Stats Row */}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        pt: 1.5,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <Box>
                        <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>
                          Volume
                        </Typography>
                        <Typography sx={{ color: '#aaa', fontSize: '13px', fontWeight: 500 }}>
                          {asset.volume}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>
                          Mkt Cap
                        </Typography>
                        <Typography sx={{ color: '#aaa', fontSize: '13px', fontWeight: 500 }}>
                          {asset.marketCap}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>
                          Bid / Ask
                        </Typography>
                        <Typography sx={{ color: '#aaa', fontSize: '13px', fontWeight: 500 }}>
                          {formatCurrency(asset.bid)} / {formatCurrency(asset.ask)}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              )
            })}
          </Grid>
        )}

        {/* No results */}
        {!loading && assets.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography sx={{ color: '#666', fontSize: '16px' }}>
              No assets match your search criteria
            </Typography>
            <Typography sx={{ color: '#444', fontSize: '14px', mt: 1 }}>
              Try adjusting your filters or search term
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  )
}