import { NextRequest, NextResponse } from 'next/server'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'
import { getAuthUserId } from '@/lib/auth';
import { slugify } from '@/lib/investmentUtils';
export const dynamic = 'force-dynamic'



export async function GET(request: NextRequest, {params}: {params:Promise<{ id: string }>}){
  try {
    const {id}=await params
    const decodedId=decodeURIComponent(id)
    const allAssets = secondaryTradingAssets.investments as any[];
    const templates=secondaryTradingAssets.templates as any

    const asset = allAssets.find((a)=>a.id === decodedId || slugify(a.title) === decodedId)

    if(!asset){
        return NextResponse.json({error:'Asset Not Found'},{status:404})
    }

    //build orderbook based on template and asset base price
    const orderBook={
        asks: templates.orderBook.asks.map((entry:any)=>({
            price: Number((entry.priceMultiplier * asset.basePrice).toFixed(4)),
            size: entry.size,
        })),
        bids: templates.orderBook.bids.map((entry:any)=>({
            price: Number((entry.priceMultiplier * asset.basePrice).toFixed(4)),
            size: entry.size,
        })),
    }
   
    //build market history based on template and asset base price
    const marketHistory = templates.marketHistory.map((entry: any) => ({
      price: Number((entry.priceMultiplier * asset.basePrice).toFixed(4)),
      time: entry.time,
      quantity: entry.qty,
    }))

    return NextResponse.json({ asset, orderBook, marketHistory,  templates: templates })

  } catch (error: any) {
    console.error('Error fetching asset detail:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch asset' },
      { status: 500 }
    )
  }
}
