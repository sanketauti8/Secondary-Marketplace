import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trading/holdings
 * Get user's share holdings. Optional: ?symbol=NVMT
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')

    let query = 'SELECT * FROM trading_holdings WHERE user_id = ?'
    const queryParams: any[] = [userId]

    if (symbol) {
      query += ' AND symbol = ?'
      queryParams.push(symbol)
    }

    query += ' ORDER BY updated_at DESC'

    const holdings = db.prepare(query).all(...queryParams)

    return NextResponse.json({ holdings })
  } catch (error: any) {
    console.error('Error fetching holdings:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch holdings' },
      { status: 500 }
    )
  }
}