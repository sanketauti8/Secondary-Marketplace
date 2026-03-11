import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAuthUserId } from '@/lib/auth'
import db from '@/lib/db'
import { matchOrder } from '@/lib/matchingEngine'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'
export const dynamic = 'force-dynamic'

/**
 * POST /api/trading/orders
 * Place a new buy or sell order.
 *
 * Body: { symbol, side, quantity, price, timeInForce?, goodTilDate? }
 */

export async function POST(request: NextRequest) {
    try{
        const userId= await getAuthUserId(request)
        if(!userId){
            return NextResponse.json({error:'Unauthorized'},{status:401})
        }
        const body=await request.json()
        const {symbol,side,quantity,price,timeInForce='day',goodTilDate=null}=body;

        //validate inputs
        if(!symbol || !side || !quantity || !price){
            return NextResponse.json({error:'Missing required fields'},{status:400})
        }
         // Validate side
    if (!['buy', 'sell'].includes(side)) {
      return NextResponse.json({ error: 'Side must be "buy" or "sell"' }, { status: 400 })
    }

    // Validate quantity
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive integer' }, { status: 400 })
    }

    // Validate price
    const orderPrice = Number(price)
    if (isNaN(orderPrice) || orderPrice <= 0) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 })
    }

    // Validate asset exists
    const assets = secondaryTradingAssets.investments as any[]
    const asset = assets.find((a) => a.symbol === symbol)
    if (!asset) {
      return NextResponse.json({ error: `Unknown asset symbol: ${symbol}` }, { status: 400 })
    }

    // Validate time in force
    if (!['day', 'gtd', 'gtc'].includes(timeInForce)) {
      return NextResponse.json({ error: 'timeInForce must be "day", "gtd", or "gtc"' }, { status: 400 })
    }
    if (side === 'buy') {
      // Check cash balance
      const balance = db
        .prepare('SELECT cash_balance FROM trading_balances WHERE user_id = ?')
        .get(userId) as { cash_balance: number } | undefined

      const cashBalance = balance?.cash_balance || 0
      const totalCost = qty * orderPrice

      if (cashBalance < totalCost) {
        return NextResponse.json(
          {
            error: `Insufficient funds. Required: $${totalCost.toFixed(2)}, Available: $${cashBalance.toFixed(2)}`,
          },
          { status: 400 }
        )
      }

      // Deduct funds immediately (reserve)
      db.prepare(
        `UPDATE trading_balances SET cash_balance = cash_balance - ?, updated_at = datetime('now') WHERE user_id = ?`
      ).run(totalCost, userId)
    } else {
      // Sell order — check user holds enough shares
      const holding = db
        .prepare('SELECT shares FROM trading_holdings WHERE user_id = ? AND symbol = ?')
        .get(userId, symbol) as { shares: number } | undefined

      const sharesHeld = holding?.shares || 0
      if (sharesHeld < qty) {
        return NextResponse.json(
          {
            error: `Insufficient shares. Required: ${qty}, Held: ${sharesHeld}`,
          },
          { status: 400 }
        )
      }
    }

    // Place order through matching engine
    const orderId = crypto.randomUUID()
    const result = matchOrder(orderId, userId, symbol, side, qty, orderPrice, timeInForce, goodTilDate)

    // If buy order was partially or fully filled, refund unused reserved cash
    if (side === 'buy') {
      const refundQty = result.remaining
      if (refundQty > 0 && result.status === 'Completed') {
        // This shouldn't happen for Completed, but just in case
      }
      // If order is still pending (not fully filled), the reserved amount stays deducted.
      // When order is cancelled later, we'll refund.
    }

    // If sell order matched, credit the seller
    if (side === 'sell') {
      const filledQty = qty - result.remaining
      if (filledQty > 0) {
        // Get the trades for this order to find actual fill prices
        const trades = db
          .prepare('SELECT quantity, price FROM trading_trades WHERE sell_order_id = ?')
          .all(orderId) as { quantity: number; price: number }[]

        const totalProceeds = trades.reduce((sum, t) => sum + t.quantity * t.price, 0)
        if (totalProceeds > 0) {
          const existingBalance = db
            .prepare('SELECT id FROM trading_balances WHERE user_id = ?')
            .get(userId)

          if (existingBalance) {
            db.prepare(
              `UPDATE trading_balances SET cash_balance = cash_balance + ?, updated_at = datetime('now') WHERE user_id = ?`
            ).run(totalProceeds, userId)
          } else {
            db.prepare(
              `INSERT INTO trading_balances (id, user_id, cash_balance, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`
            ).run(crypto.randomUUID(), userId, totalProceeds)
          }
        }
      }
    }

    // If buy order matched, credit the counterparty seller
    if (side === 'buy') {
      const trades = db
        .prepare('SELECT sell_order_id, quantity, price FROM trading_trades WHERE buy_order_id = ?')
        .all(orderId) as { sell_order_id: string; quantity: number; price: number }[]

      for (const trade of trades) {
        const sellOrder = db
          .prepare('SELECT user_id FROM trading_orders WHERE id = ?')
          .get(trade.sell_order_id) as { user_id: string } | undefined

        if (sellOrder) {
          const sellerBalance = db
            .prepare('SELECT id FROM trading_balances WHERE user_id = ?')
            .get(sellOrder.user_id)

          const proceeds = trade.quantity * trade.price
          if (sellerBalance) {
            db.prepare(
              `UPDATE trading_balances SET cash_balance = cash_balance + ?, updated_at = datetime('now') WHERE user_id = ?`
            ).run(proceeds, sellOrder.user_id)
          } else {
            db.prepare(
              `INSERT INTO trading_balances (id, user_id, cash_balance, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`
            ).run(crypto.randomUUID(), sellOrder.user_id, proceeds)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      order: {
        id: result.orderId,
        symbol,
        side,
        quantity: qty,
        price: orderPrice,
        status: result.status,
        remaining: result.remaining,
        timeInForce,
      },
    })
  } catch (error: any) {
    console.error('Error placing order:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to place order' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/trading/orders
 * Get user's orders. Optional: ?symbol=NVMT&status=Pending
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const status = searchParams.get('status')

    let query = 'SELECT * FROM trading_orders WHERE user_id = ?'
    const queryParams: any[] = [userId]

    if (symbol) {
      query += ' AND symbol = ?'
      queryParams.push(symbol)
    }

    if (status) {
      query += ' AND status = ?'
      queryParams.push(status)
    }

    query += ' ORDER BY created_at DESC'

    const orders = db.prepare(query).all(...queryParams)

    return NextResponse.json({ orders })
  } catch (error: any) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}