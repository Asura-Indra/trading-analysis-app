// --- Type Definitions for Clarity and Safety ---
export interface Tick {
  timestamp: number;
  currentPrice: number;
  volume: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  // VWAP is often provided by the feed, but we will calculate it.
  vwap?: number;
}

export interface TradeSignal {
  type: 'BUY' | 'SELL';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  timestamp: number;
}

// --- Utility: A highly efficient Deque implementation ---
// A Deque is essential for O(1) additions and removals from both ends.
class Deque<T> {
  private head = 0;
  private tail = 0;
  private items: Record<number, T> = {};

  push(item: T): void {
    this.items[this.tail++] = item;
  }

  shift(): T | undefined {
    if (this.size() === 0) return undefined;
    const item = this.items[this.head];
    delete this.items[this.head++];
    return item;
  }

  size(): number {
    return this.tail - this.head;
  }

  toArray(): T[] {
    // Preserve order by iterating from head to tail
    const result: T[] = [];
    for (let i = this.head; i < this.tail; i++) {
      result.push(this.items[i]);
    }
    return result;
  }
}

// --- 1. The Data Handler: Efficient & Robust State Management ---
// Manages the time-series data and calculates aggregates incrementally (O(1)).
class TickDataBuffer {
  private readonly ticks: Deque<Tick> = new Deque<Tick>();
  private readonly maxSize: number;

  // --- Online Aggregates (calculated in O(1) per tick) ---
  public sumPrice = 0;
  public sumVolume = 0;
  public sumPriceVolume = 0; // For VWAP
  public sumReturnsSq = 0; // For volatility (Standard Deviation)

  public high = -Infinity;
  public low = Infinity;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  public add(tick: Tick): void {
    // --- Data Validation: A critical first step ---
    if (!tick || typeof tick.currentPrice !== 'number' || tick.currentPrice <= 0 || tick.volume < 0) {
      console.warn('Invalid tick received. Discarding.', tick);
      return;
    }

    const lastPrice = this.ticks.size() > 0 ? this.ticks.toArray()[this.ticks.size() - 1].currentPrice : tick.currentPrice;

    this.ticks.push(tick);
    // --- Incremental (Online) Calculation ---
    this.sumPrice += tick.currentPrice;
    this.sumVolume += tick.volume;
    this.sumPriceVolume += tick.currentPrice * tick.volume;
    
    // Calculate log return safely (avoid division by zero and invalid log)
    if (lastPrice > 0 && tick.currentPrice > 0 && lastPrice !== tick.currentPrice) {
      const logReturn = Math.log(tick.currentPrice / lastPrice);
      this.sumReturnsSq += logReturn * logReturn;
    }
    
    this.high = Math.max(this.high, tick.currentPrice);
    this.low = Math.min(this.low, tick.currentPrice);

    // --- Maintain Rolling Window ---
    if (this.ticks.size() > this.maxSize) {
      const oldTick = this.ticks.shift();
      if (oldTick) {
        // Decrement aggregates
        this.sumPrice -= oldTick.currentPrice;
        this.sumVolume -= oldTick.volume;
        this.sumPriceVolume -= oldTick.currentPrice * oldTick.volume;
        // Note: Re-calculating volatility and high/low is more complex for rolling windows.
        // For true O(1) high/low, a specialized deque is needed. For simplicity, we re-calc here.
        // A pragmatic compromise for non-core stats.
        this.recalculateComplexAggregates();
      }
    }
  }

  private recalculateComplexAggregates(): void {
    const allTicks = this.ticks.toArray();
    this.high = -Infinity;
    this.low = Infinity;
    // Recalculate sumReturnsSq for rolling window
    // Note: For a true HFT system, we would use Welford's algorithm for rolling variance.
    // This is a pragmatic compromise for non-core stats.
    this.sumReturnsSq = 0;
    for (let i = 1; i < allTicks.length; i++) {
      const prevPrice = allTicks[i - 1].currentPrice;
      const currPrice = allTicks[i].currentPrice;
      if (prevPrice > 0 && currPrice > 0 && prevPrice !== currPrice) {
        const logReturn = Math.log(currPrice / prevPrice);
        this.sumReturnsSq += logReturn * logReturn;
      }
      this.high = Math.max(this.high, currPrice);
      this.low = Math.min(this.low, currPrice);
    }
    if (allTicks.length > 0) {
      this.high = Math.max(this.high, allTicks[0].currentPrice);
      this.low = Math.min(this.low, allTicks[0].currentPrice);
    }
  }

  public get size(): number {
    return this.ticks.size();
  }

  public get latestTick(): Tick | undefined {
    if (this.size === 0) return undefined;
    return this.ticks.toArray()[this.size - 1];
  }

  public get allTicks(): Tick[] {
    return this.ticks.toArray();
  }
}

// --- 2. The Feature Engine: Modular & Testable Quantitative Logic ---
// A collection of pure functions for calculating financial features.
class FeatureEngine {
  // Volume-Weighted Average Price (VWAP): Critical benchmark
  public static calculateVWAP(sumPriceVolume: number, sumVolume: number): number {
    return sumVolume > 0 ? sumPriceVolume / sumVolume : 0;
  }

  // Order Book Imbalance (OBI): A better measure of pressure
  public static calculateOBI(latestTick: Tick): number {
    const { totalBuyQuantity, totalSellQuantity } = latestTick;
    const totalLiquidity = totalBuyQuantity + totalSellQuantity;
    return totalLiquidity > 0 ? (totalBuyQuantity - totalSellQuantity) / totalLiquidity : 0;
  }

  // Momentum: Simpler and more standard than linear regression
  public static calculateMomentum(currentPrice: number, startPrice: number): number {
    return startPrice > 0 ? (currentPrice - startPrice) / startPrice : 0;
  }

  // Volatility: Using standard deviation of log returns
  public static calculateVolatility(sumReturnsSq: number, count: number): number {
    if (count < 2) return 0;
    const variance = sumReturnsSq / (count - 1);
    return Math.sqrt(variance); // Annualize by multiplying with sqrt(num_ticks_per_year) if needed
  }
}

// --- 3. The Main System: Orchestration and Decision Logic ---
export class TradingSystem {
  private readonly dataBuffer: TickDataBuffer;
  private currentTradeSignal: TradeSignal | null = null;
  public analysisResult = '⏳ Initializing...';

  constructor(windowSize = 100) {
    this.dataBuffer = new TickDataBuffer(windowSize);
  }

  // --- Entry point for new market data ---
  public onTick(tick: Tick): void {
    this.dataBuffer.add(tick);
    this.analyze();
  }

  private analyze(): void {
    if (this.dataBuffer.size < 20) { // Require a minimum number of ticks for stable stats
      this.analysisResult = '❗ Not enough data to predict';
      return;
    }

    const allTicks = this.dataBuffer.allTicks;
    const latestTick = this.dataBuffer.latestTick;
    if (!latestTick || allTicks.length === 0) {
      this.analysisResult = '❗ Not enough data to predict';
      return;
    }

    // --- Feature Calculation ---
    const vwap = FeatureEngine.calculateVWAP(this.dataBuffer.sumPriceVolume, this.dataBuffer.sumVolume);
    const momentum = FeatureEngine.calculateMomentum(latestTick.currentPrice, allTicks[0].currentPrice);
    const obi = FeatureEngine.calculateOBI(latestTick);
    const volatility = FeatureEngine.calculateVolatility(this.dataBuffer.sumReturnsSq, this.dataBuffer.size);
    const vwapDeviation = vwap > 0 ? (latestTick.currentPrice - vwap) / vwap : 0;

    // --- Scoring Model (Example Weights - requires optimization) ---
    const w = {
      momentum: 3.0,
      vwapDev: -2.5, // Negative weight: Mean reversion signal
      obi: 3.5,
      volatility: -1.0, // Penalize high volatility
    };

    const score =
      w.momentum * momentum +
      w.vwapDev * vwapDeviation +
      w.obi * obi +
      w.volatility * volatility;

    // --- Signal Generation ---
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
    const probUp = sigmoid(score);
    const confidence = Math.round(Math.max(probUp, 1 - probUp) * 100);
    const direction = probUp > 0.60 ? 'UP' : probUp < 0.40 ? 'DOWN' : 'NEUTRAL';

    this.manageTradeSignal(direction, confidence, latestTick, volatility);
    this.updateResultMessage(direction, confidence);
  }

  private manageTradeSignal(direction: 'UP' | 'DOWN' | 'NEUTRAL', confidence: number, tick: Tick, volatility: number): void {
    if (this.currentTradeSignal) {
      // Handle exit logic for existing trade
      const { type, stopLoss, targetPrice } = this.currentTradeSignal;
      if (
        (type === 'BUY' && (tick.currentPrice <= stopLoss || tick.currentPrice >= targetPrice)) ||
        (type === 'SELL' && (tick.currentPrice >= stopLoss || tick.currentPrice <= targetPrice))
      ) {
        this.currentTradeSignal = null; // Exit trade
      }
    }

    if (this.currentTradeSignal === null && confidence >= 75 && direction !== 'NEUTRAL') {
      const type = direction === 'UP' ? 'BUY' : 'SELL';
      const entryPrice = tick.currentPrice;

      // Dynamic Stop/Target based on current volatility
      const priceMove = entryPrice * volatility * 2.0; // Dynamic risk based on vol
      const stopLossDistance = priceMove * (type === 'BUY' ? -1 : 1);
      const targetDistance = priceMove * (type === 'BUY' ? 2 : -2); // 2:1 Reward:Risk

      this.currentTradeSignal = {
        type,
        entryPrice,
        targetPrice: entryPrice + targetDistance,
        stopLoss: entryPrice + stopLossDistance,
        confidence,
        timestamp: tick.timestamp,
      };
    }
  }

  private updateResultMessage(direction: 'UP' | 'DOWN' | 'NEUTRAL', confidence: number): void {
    if (this.currentTradeSignal) {
      const { type, entryPrice, targetPrice, stopLoss } = this.currentTradeSignal;
      const emoji = type === 'BUY' ? '📈' : '📉';
      const risk = Math.abs(entryPrice - stopLoss);
      const reward = Math.abs(targetPrice - entryPrice);
      const riskRewardRatio = reward / risk;

      // Check exit conditions
      const latestTick = this.dataBuffer.latestTick;
      if (!latestTick) return;
      
      if (type === 'BUY') {
        if (latestTick.currentPrice <= stopLoss) {
          this.analysisResult = `🔴 EXIT BUY: Stop Loss hit at ${stopLoss.toFixed(2)}`;
          this.currentTradeSignal = null;
        } else if (latestTick.currentPrice >= targetPrice) {
          this.analysisResult = `✅ EXIT BUY: Target reached at ${targetPrice.toFixed(2)}`;
          this.currentTradeSignal = null;
        } else {
          this.analysisResult = `${emoji} ACTIVE ${type} (${confidence}% conf)\n` +
            `Entry: ${entryPrice.toFixed(2)} | ` +
            `TP: ${targetPrice.toFixed(2)} | ` +
            `SL: ${stopLoss.toFixed(2)}\n` +
            `R:R = ${riskRewardRatio.toFixed(2)}:1`;
        }
      } else {
        if (latestTick.currentPrice >= stopLoss) {
          this.analysisResult = `🔴 EXIT SELL: Stop Loss hit at ${stopLoss.toFixed(2)}`;
          this.currentTradeSignal = null;
        } else if (latestTick.currentPrice <= targetPrice) {
          this.analysisResult = `✅ EXIT SELL: Target reached at ${targetPrice.toFixed(2)}`;
          this.currentTradeSignal = null;
        } else {
          this.analysisResult = `${emoji} ACTIVE ${type} (${confidence}% conf)\n` +
            `Entry: ${entryPrice.toFixed(2)} | ` +
            `TP: ${targetPrice.toFixed(2)} | ` +
            `SL: ${stopLoss.toFixed(2)}\n` +
            `R:R = ${riskRewardRatio.toFixed(2)}:1`;
        }
      }
    } else {
      const emoji = direction === 'UP' ? '⬆️' : direction === 'DOWN' ? '⬇️' : '⚖️';
      this.analysisResult = `${emoji} ${direction} (${confidence}% conf) | Waiting for high-confidence signal...`;
    }
  }

  public getCurrentTradeSignal(): TradeSignal | null {
    return this.currentTradeSignal;
  }

  public reset(): void {
    this.currentTradeSignal = null;
    this.analysisResult = '⏳ Initializing...';
  }
}

