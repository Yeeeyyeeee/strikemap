import { NextResponse } from "next/server";

const SYMBOLS = ["CL=F", "BZ=F", "GC=F", "^VIX", "DX-Y.NYB", "ITA"];

export interface MarketTicker {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  marketState: string;
}

export interface MarketsResponse {
  tickers: MarketTicker[];
  timestamp: number;
}

async function fetchSymbol(symbol: string): Promise<MarketTicker | null> {
  try {
    // Use 5d range so we always have a previous trading day's close to compare against
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.meta) return null;

    const price = result.meta.regularMarketPrice ?? 0;
    const marketState: string = result.meta.marketState ?? "CLOSED";

    // chartPreviousClose = the close before the chart range, reliable even when closed
    // Also parse actual close candles as fallback
    let prevClose = result.meta.chartPreviousClose ?? result.meta.previousClose ?? price;

    // If we have actual candle data, use the second-to-last close as prevClose
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((c): c is number => c != null);
    if (validCloses.length >= 2) {
      // Last valid close is today (or most recent day), second-to-last is previous day
      prevClose = validCloses[validCloses.length - 2];
    }

    const change = price - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    return { symbol, price, change, changePercent, marketState };
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(SYMBOLS.map(fetchSymbol));
  const tickers = results.filter((t): t is MarketTicker => t !== null);

  return NextResponse.json(
    { tickers, timestamp: Date.now() } satisfies MarketsResponse,
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    }
  );
}
