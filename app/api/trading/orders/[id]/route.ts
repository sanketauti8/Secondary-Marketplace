import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/trading/orders/[id]
 * Cancel an open order. Refunds reserved cash for buy orders.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params

    // Find the order
    const order = db
      .prepare('SELECT * FROM trading_orders WHERE id = ? AND user_id = ?')
      .get(orderId, userId) as any

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Only cancel orders that are still open
    if (!['New', 'Pending', 'PartiallyFilled'].includes(order.status)) {
      return NextResponse.json(
        { error: `Cannot cancel order with status: ${order.status}` },
        { status: 400 }
      )
    }

    // Cancel the order
    db.prepare(
      `UPDATE trading_orders SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?`
    ).run(orderId)

    // Refund reserved cash for buy orders
    if (order.side === 'buy') {
      const refundAmount = order.remaining_quantity * order.price
      if (refundAmount > 0) {
        db.prepare(
          `UPDATE trading_balances SET cash_balance = cash_balance + ?, updated_at = datetime('now') WHERE user_id = ?`
        ).run(refundAmount, userId)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully',
      refunded: order.side === 'buy' ? order.remaining_quantity * order.price : 0,
    })
  } catch (error: any) {
    console.error('Error cancelling order:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to cancel order' },
      { status: 500 }
    )
  }
}