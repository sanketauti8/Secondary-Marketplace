'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  List,
  Typography,
  ListItem,
  ListItemText,
  IconButton,
  Paper,
  Grid,
  Chip,
} from '@mui/material'
import {
  ArrowForward,
  TrendingUp,
} from '@mui/icons-material'
import { useTheme } from '@mui/material/styles'
import PortfolioSummaryCard from './PortfolioSummaryCard'
import InvestmentsSection from './InvestmentsSection'
import styles from './CashBalance.module.css'
import api from '@/lib/api'
import { formatCurrency, getSeededColor } from '@/lib/investmentUtils'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'

interface Investment {
  id: string
  amount: number
  payment_status: string
}

interface TradingHolding {
  id: string
  user_id: string
  symbol: string
  shares: number
  avg_cost: number
}

export default function CashBalance() {
  const router = useRouter()
  const theme = useTheme()
  const [cashAvailable, setCashAvailable] = useState(0)
  const [tradingBalance, setTradingBalance] = useState(0)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [tradingHoldings, setTradingHoldings] = useState<TradingHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [isPositionsExpanded, setIsPositionsExpanded] = useState(false)
  const [isTradingExpanded, setIsTradingExpanded] = useState(true)

  const allAssets = secondaryTradingAssets.investments as any[]

  const fetchBalances = async () => {
    try {
      const balanceResponse = await fetch('/api/banking/balance')
      if (balanceResponse.ok) {
        const data = await balanceResponse.json()
        setCashAvailable(Number(data.balance) || 0)
      }
    } catch (error) {
      console.error('Error fetching cash balance:', error)
    }
  }

  const fetchTradingData = async () => {
    try {
      const [balanceRes, holdingsRes] = await Promise.all([
        api.get('/trading/balance'),
        api.get('/trading/holdings'),
      ])
      setTradingBalance(balanceRes.data.balance || 0)
      setTradingHoldings(holdingsRes.data.holdings || [])
    } catch (error) {
      // Trading APIs might not be available yet — that's fine
      console.error('Error fetching trading data:', error)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([fetchInvestments(), fetchBalances()])
      } catch (error) {
        console.error('Error loading portfolio data:', error)
      } finally {
        setLoading(false)
      }
      // Fetch trading data separately so it doesn't block the page
      fetchTradingData()
    }
    loadData()
  }, [])

  const fetchInvestments = async () => {
    try {
      const response = await fetch('/api/investments')
      if (response.ok) {
        const data = await response.json()
        setInvestments(data.investments || [])
      }
    } catch (error) {
      console.error('Error fetching investments:', error)
    }
  }

  // Calculate portfolio values
  const investedAmount = investments
    .filter((inv) => inv.payment_status === 'COMPLETED')
    .reduce((sum, inv) => sum + inv.amount, 0)

  // Calculate trading holdings value
  const tradingHoldingsValue = tradingHoldings.reduce((sum, h) => {
    const asset = allAssets.find((a) => a.symbol === h.symbol)
    const currentPrice = asset?.currentValue || h.avg_cost
    return sum + h.shares * currentPrice
  }, 0)

  const portfolioValue = investedAmount + cashAvailable + tradingBalance + tradingHoldingsValue

  return (
    <Box className={styles.content}>
      {/* Portfolio Summary Section */}
      <PortfolioSummaryCard
        totalValue={portfolioValue}
        cashAvailable={cashAvailable}
        investedAmount={investedAmount + tradingHoldingsValue}
        onInvestedClick={() => setIsPositionsExpanded(!isPositionsExpanded)}
      />

      {/* Trading Holdings Section */}
      {tradingHoldings.length > 0 && (
        <Paper
          sx={{
            mt: 2,
            p: 0,
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Box
            onClick={() => setIsTradingExpanded(!isTradingExpanded)}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              cursor: 'pointer',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUp sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
              <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>
                Trading Holdings
              </Typography>
              <Chip
                label={formatCurrency(tradingHoldingsValue)}
                size="small"
                sx={{
                  backgroundColor: 'rgba(0,255,136,0.1)',
                  color: theme.palette.primary.main,
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              />
            </Box>
            <Typography sx={{ color: '#555', fontSize: '13px' }}>
              Cash: {formatCurrency(tradingBalance)}
            </Typography>
          </Box>

          {isTradingExpanded && (
            <Box sx={{ px: 2, pb: 2 }}>
              {tradingHoldings.map((holding) => {
                const asset = allAssets.find((a) => a.symbol === holding.symbol)
                const currentPrice = asset?.currentValue || holding.avg_cost
                const marketValue = holding.shares * currentPrice
                const pnl = (currentPrice - holding.avg_cost) * holding.shares
                const pnlPct = holding.avg_cost > 0 ? ((currentPrice - holding.avg_cost) / holding.avg_cost) * 100 : 0

                return (
                  <Box
                    key={holding.id}
                    onClick={() => router.push(`/investing/secondary-trading/${asset?.id || ''}`)}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 1.5,
                      px: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.03)' },
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '8px',
                          background: `linear-gradient(135deg, ${getSeededColor(holding.symbol)}, rgba(0,0,0,0.3))`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '11px' }}>
                          {holding.symbol.slice(0, 2)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                          {holding.symbol}
                        </Typography>
                        <Typography sx={{ color: '#888', fontSize: '12px' }}>
                          {holding.shares} shares @ {formatCurrency(holding.avg_cost)}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                        {formatCurrency(marketValue)}
                      </Typography>
                      <Typography
                        sx={{
                          color: pnl >= 0 ? theme.palette.primary.main : '#ff4d4d',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)} ({pnlPct.toFixed(1)}%)
                      </Typography>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )}
        </Paper>
      )}

      {/* Investments Section */}
      <InvestmentsSection
        isPositionsExpanded={isPositionsExpanded}
        onTogglePositions={() => setIsPositionsExpanded(!isPositionsExpanded)}
      />

      {/* All History Section */}
      <Box className={styles.historySection}>
        <Typography variant="h6" className={styles.sectionTitle}>
          ALL HISTORY
        </Typography>
        <List className={styles.historyList}>
          <ListItem
            className={styles.historyItem}
            onClick={() => {
              // Handle transactions click
            }}
          >
            <ListItemText
              primary="All Transactions"
              secondary="Past Transactions"
              className={styles.historyText}
            />
            <IconButton edge="end" className={styles.historyArrow}>
              <ArrowForward />
            </IconButton>
          </ListItem>
          <ListItem
            className={styles.historyItem}
            onClick={() => {
              // Handle documents click
            }}
          >
            <ListItemText
              primary="All Documents"
              secondary="Account Statements, Tax Docs..."
              className={styles.historyText}
            />
            <IconButton edge="end" className={styles.historyArrow}>
              <ArrowForward />
            </IconButton>
          </ListItem>
        </List>
      </Box>
    </Box>
  )
}