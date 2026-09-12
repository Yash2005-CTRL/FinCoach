import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/require-user";

const allowedSymbol = /^[A-Z0-9.-]{1,20}$/;
const trendingSymbols = [
  "RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS", "ICICIBANK.NS", "BHARTIARTL.NS",
  "SBIN.NS", "ITC.NS", "LT.NS", "BAJFINANCE.NS", "AAPL", "MSFT", "NVDA", "TSLA",
];

async function fetchQuote(symbol: string, range = "1d") {
  const chartSettings: Record<string, { range: string; interval: string }> = {
    "1d": { range: "1d", interval: "5m" }, "5d": { range: "5d", interval: "15m" }, "1mo": { range: "1mo", interval: "1h" },
    "6mo": { range: "6mo", interval: "1d" }, "1y": { range: "1y", interval: "1d" }, "5y": { range: "5y", interval: "1wk" }, max: { range: "max", interval: "1mo" },
  };
  const selectedRange = chartSettings[range] ?? chartSettings["1d"];
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${selectedRange.range}&interval=${selectedRange.interval}`, { next: { revalidate: 300 } });
  if (!response.ok) return null;
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta?.regularMarketPrice) return null;
  const price = Number(meta.regularMarketPrice);
  const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? price);
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const history = timestamps.map((timestamp: number, index: number) => ({ time: new Date(timestamp * 1000).toISOString(), price: Number(closes[index]) })).filter((point: { price: number }) => Number.isFinite(point.price));
  return { symbol, currency: meta.currency ?? "INR", exchange: meta.exchangeName ?? "Market", price, previousClose, change: price - previousClose, changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : 0, asOf: new Date().toISOString(), history };
}

export async function GET(request: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get("trending") === "true") {
    const quotes = await Promise.all(trendingSymbols.map(async (symbol) => {
      const quote = await fetchQuote(symbol).catch(() => null);
      return quote ?? { symbol, currency: "--", exchange: "Unavailable", price: null, change: null, changePercent: null, asOf: new Date().toISOString(), unavailable: true };
    }));
    return NextResponse.json({ quotes, asOf: new Date().toISOString(), disclaimer: "Informational market data, not investment advice." });
  }
  const symbol = searchParams.get("symbol")?.trim().toUpperCase() ?? "RELIANCE.NS";
  const range = searchParams.get("range") ?? "1d";
  if (!allowedSymbol.test(symbol)) return NextResponse.json({ error: "Invalid market symbol" }, { status: 400 });
  try {
    const quote = await fetchQuote(symbol, range);
    if (!quote) return NextResponse.json({ error: "Symbol not found or market data provider unavailable" }, { status: 404 });
    return NextResponse.json({ ...quote, disclaimer: "Informational market data, not investment advice." });
  } catch (error) {
    console.error("Market data request failed", error);
    return NextResponse.json({ error: "Unable to load market data" }, { status: 502 });
  }
}