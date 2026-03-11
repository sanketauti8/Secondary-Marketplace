import { NextRequest, NextResponse } from 'next/server'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'
import { getAuthUserId } from '@/lib/auth';
export const dynamic = 'force-dynamic'

/**
 * GET 
 * 
 * Returns all available trading assets.
 *
 * TODO: Add query params for filtering/searching (e.g. ?category=tech, ?search=nova)
 * TODO: Consider making this authenticated using getAuthUserId() from '@/lib/auth'
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const {searchParams} = new URL(request.url);
    const search=searchParams.get('search')?.toLowerCase() || '';
    const category=searchParams.get('category')?.toLowerCase() || '';
    const sort=searchParams.get('sort') || '';

    let assets = [...secondaryTradingAssets.investments] as any[];

    //filter by search 
    if(search){
      assets=assets.filter(
        (a)=>a.title.toLowerCase().includes(search) || (a.symbol && a.symbol.toLowerCase().includes(search))
      )
    }
    //filter by categoty
    if(category){
      assets=assets.filter((a)=>a.category===category)
    }
    //sorting
    switch(sort){
      case 'price_asc':
        assets.sort((a,b)=>a.currentValue - b.currentValue);
        break;
        case 'price_desc':
          assets.sort((a,b)=>b.currentValue - a.currentValue);
          break;
        case 'change_asc':
          assets.sort((a,b)=>a.performancePercent - b.performancePercent);
          break;
        case 'change_desc':
          assets.sort((a,b)=>b.performancePercent - a.performancePercent);
          break;
        case 'name_asc':
          assets.sort((a, b) => a.title.localeCompare(b.title))
          break
        case 'name_desc':
          assets.sort((a, b) => b.title.localeCompare(a.title))
          break
    }

    return NextResponse.json({
      assets,
      total: assets.length,
    })
  } catch (error: any) {
    console.error('Error fetching trading assets:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch assets' },
      { status: 500 }
    )
  }
}
