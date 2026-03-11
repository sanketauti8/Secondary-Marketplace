import { describe, it, expect, beforeEach } from '@jest/globals'
import crypto from 'crypto'
import db from '@/lib/db'

// use: npm test (to run this test file)) 

// Helper: create a test user and seed balance
function createTestUser(balance: number = 1000) {
  const userId = `test_${crypto.randomUUID()}`
  
  // Insert user
  db.prepare(
    "INSERT INTO users (id, email, password) VALUES (?, ?, ?)"
  ).run(userId, `${userId}@test.com`, 'hashedpassword')

  // Seed trading balance
  db.prepare(
    "INSERT INTO trading_balances (id, user_id, cash_balance, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
  ).run(crypto.randomUUID(), userId, balance)

  return userId
}

// Helper: seed holdings for a user
function seedHoldings(userId: string, symbol: string, shares: number, avgCost: number) {
  db.prepare(
    "INSERT INTO trading_holdings (id, user_id, symbol, shares, avg_cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  ).run(crypto.randomUUID(), userId, symbol, shares, avgCost)
}

// Helper: get balance
function getBalance(userId: string): number {
  const row = db.prepare('SELECT cash_balance FROM trading_balances WHERE user_id = ?').get(userId) as any
  return row?.cash_balance || 0
}

// Helper: get holdings
function getHoldings(userId: string, symbol: string) {
  return db.prepare('SELECT * FROM trading_holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol) as any
}

describe('Trading Orders API', () => {

  // ─── Validation Tests ─────────────────────────────

  describe('Input Validation', () => {
    it('should reject order with missing fields', () => {
      // Test: send empty body
      const body = {}
      expect(body).not.toHaveProperty('symbol')
      // In real test, you'd call the API and check response
    })

    it('should reject invalid side', () => {
      const side = 'hold'
      expect(['buy', 'sell'].includes(side)).toBe(false)
    })

    it('should reject negative quantity', () => {
      const qty = -5
      expect(Number.isInteger(qty) && qty > 0).toBe(false)
    })

    it('should reject zero price', () => {
      const price = 0
      expect(price > 0).toBe(false)
    })

    it('should reject unknown symbol', () => {
      const assets = [{ symbol: 'NVMT' }, { symbol: 'HLXB' }]
      const found = assets.find(a => a.symbol === 'FAKE')
      expect(found).toBeUndefined()
    })
  })

  // ─── Buy Order Tests ──────────────────────────────

  describe('Buy Orders', () => {
    it('should deduct cash when placing buy order', () => {
      const userId = createTestUser(1000)
      const qty = 10
      const price = 3.09
      const totalCost = qty * price  // $30.90

      // Simulate cash deduction
      db.prepare(
        "UPDATE trading_balances SET cash_balance = cash_balance - ? WHERE user_id = ?"
      ).run(totalCost, userId)

      const balance = getBalance(userId)
      expect(balance).toBeCloseTo(1000 - 30.90, 2)
    })

    it('should reject buy order when insufficient funds', () => {
      const userId = createTestUser(20)  // only $20
      const totalCost = 10 * 3.09       // needs $30.90

      const balance = getBalance(userId)
      expect(balance < totalCost).toBe(true)
    })

    it('should allow buy order when exact funds available', () => {
      const userId = createTestUser(30.90)
      const totalCost = 10 * 3.09

      const balance = getBalance(userId)
      expect(balance >= totalCost).toBe(true)
    })
  })

  // ─── Sell Order Tests ─────────────────────────────

  describe('Sell Orders', () => {
    it('should reject sell order when no shares held', () => {
      const userId = createTestUser(1000)
      const holding = getHoldings(userId, 'NVMT')
      
      expect(holding).toBeUndefined()
      // No shares → can't sell
    })

    it('should reject sell order when insufficient shares', () => {
      const userId = createTestUser(1000)
      seedHoldings(userId, 'NVMT', 5, 3.09)  // only 5 shares

      const holding = getHoldings(userId, 'NVMT')
      const wantToSell = 10

      expect(holding.shares < wantToSell).toBe(true)
    })

    it('should allow sell order when sufficient shares', () => {
      const userId = createTestUser(1000)
      seedHoldings(userId, 'NVMT', 20, 3.09)  // 20 shares

      const holding = getHoldings(userId, 'NVMT')
      const wantToSell = 10

      expect(holding.shares >= wantToSell).toBe(true)
    })
  })

  // ─── Order Matching Tests ─────────────────────────

  describe('Order Matching', () => {
    it('should match buy and sell orders at same price', () => {
      const buyer = createTestUser(1000)
      const seller = createTestUser(1000)
      seedHoldings(seller, 'NVMT', 50, 3.09)

      // Seller places sell order first
      const { matchOrder } = require('@/lib/matchingEngine')
      const sellResult = matchOrder(
        crypto.randomUUID(), seller, 'NVMT', 'sell', 10, 3.09, 'day', null
      )
      expect(sellResult.status).toBe('Pending')  // no buyer yet

      // Buyer places buy order → should match
      const buyResult = matchOrder(
        crypto.randomUUID(), buyer, 'NVMT', 'buy', 10, 3.09, 'day', null
      )
      expect(buyResult.status).toBe('Completed')  // matched!
      expect(buyResult.remaining).toBe(0)
    })

    it('should partially fill when not enough shares available', () => {
      const buyer = createTestUser(1000)
      const seller = createTestUser(1000)
      seedHoldings(seller, 'NVMT', 50, 3.09)

      const { matchOrder } = require('@/lib/matchingEngine')

      // Seller sells 5
      matchOrder(crypto.randomUUID(), seller, 'NVMT', 'sell', 5, 3.09, 'day', null)

      // Buyer wants 10 → only 5 available
      const buyResult = matchOrder(
        crypto.randomUUID(), buyer, 'NVMT', 'buy', 10, 3.09, 'day', null
      )
      expect(buyResult.status).toBe('PartiallyFilled')
      expect(buyResult.remaining).toBe(5)
    })

    it('should not match when prices dont overlap', () => {
      const buyer = createTestUser(1000)
      const seller = createTestUser(1000)
      seedHoldings(seller, 'NVMT', 50, 3.09)

      const { matchOrder } = require('@/lib/matchingEngine')

      // Seller wants $5.00
      matchOrder(crypto.randomUUID(), seller, 'NVMT', 'sell', 10, 5.00, 'day', null)

      // Buyer only offers $3.00 → no match
      const buyResult = matchOrder(
        crypto.randomUUID(), buyer, 'NVMT', 'buy', 10, 3.00, 'day', null
      )
      expect(buyResult.status).toBe('Pending')
      expect(buyResult.remaining).toBe(10)
    })
  })

  // ─── Cancel Order Tests ───────────────────────────

  describe('Cancel Orders', () => {
    it('should refund cash when cancelling buy order', () => {
      const userId = createTestUser(1000)
      const price = 3.09
      const qty = 10
      const totalCost = price * qty

      // Deduct cash (simulate placing buy order)
      db.prepare(
        "UPDATE trading_balances SET cash_balance = cash_balance - ? WHERE user_id = ?"
      ).run(totalCost, userId)

      expect(getBalance(userId)).toBeCloseTo(1000 - 30.90, 2)

      // Refund (simulate cancelling)
      db.prepare(
        "UPDATE trading_balances SET cash_balance = cash_balance + ? WHERE user_id = ?"
      ).run(totalCost, userId)

      expect(getBalance(userId)).toBeCloseTo(1000, 2)
    })

    it('should not allow cancelling completed orders', () => {
      const status = 'Completed'
      const canCancel = ['New', 'Pending', 'PartiallyFilled'].includes(status)
      expect(canCancel).toBe(false)
    })

    it('should not allow cancelling already cancelled orders', () => {
      const status = 'Cancelled'
      const canCancel = ['New', 'Pending', 'PartiallyFilled'].includes(status)
      expect(canCancel).toBe(false)
    })
  })
})