import { Component, inject, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { IconFieldModule } from 'primeng/iconfield';
import { InputTextModule } from 'primeng/inputtext';
import { InputIconModule } from 'primeng/inputicon';
import { MarketStreamService } from '../../services/market-stream.service';
import Chart from 'chart.js/auto';
import { ButtonModule } from 'primeng/button';
import { debounce, debounceTime } from 'rxjs';

interface Instrument {
  instrument_token: number;
  name: string;
}

interface TradeSignal {
  type: 'BUY' | 'SELL';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  timestamp: number;
}

interface TradingAnalysis {
  signal?: TradeSignal;
  currentPrice: number;
  riskRewardRatio: number;
  potentialProfit: number;
  maxLoss: number;
}

@Component({
  selector: 'app-trading-list',
  templateUrl: './trading-list.component.html',
  styleUrls: ['./trading-list.component.less'],
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    IconFieldModule,
    InputTextModule,
    InputIconModule,
    ButtonModule,
  ],
})
export class TradingListComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  public marketStreamService = inject(MarketStreamService);
  instruments: Instrument[] = [];
  analysisResult = '';
  instrumentTokens: number;
  elapsedSeconds = 0;
  public tickData: Array<Record<string, any>> = [];
  private timer: number | null = null;
  private chart: Chart | null = null;
  
  // Trade analysis properties
  private currentTradeSignal: TradeSignal | null = null;
  private readonly defaultRiskPercent = 1.5; // 1.5% risk per trade
  private readonly minRiskRewardRatio = 1.5; // Minimum risk:reward ratio

  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;

  get elapsedTime(): { minutes: number; seconds: number } {
    return {
      minutes: Math.floor(this.elapsedSeconds / 60),
      seconds: this.elapsedSeconds % 60,
    };
  }

  private lastAnalysisTime = 0;
  private readonly ANALYSIS_INTERVAL = 5000; // Minimum 5 seconds between analyses
  private readonly MIN_TICKS_FOR_ANALYSIS = 5; // Minimum ticks needed for analysis

  ngOnInit() {
    this.loadInstruments();
    this.marketStreamService.messageData.pipe(debounceTime(5000)).subscribe((data) => {
      if (data?.length) {
        this.tickData.push(...data);
        this.updateChart();
        this.analyzeData();
      }
    });
  }

  loadInstruments() {
    this.http
      .get('assets/meta-data/instruments.csv', { responseType: 'text' })
      .subscribe((data) => {
        // Parse CSV data
        const lines = data.split('\n');
        const headers = lines[0].split(',');
        const tokenIndex = headers.indexOf('instrument_token');
        const tradingsymbolIndex = headers.indexOf('tradingsymbol');
        const nameIndex = headers.indexOf('name');

        this.instruments = lines
          .slice(1)
          .map((line) => {
            const values = line.split(',');
            return {
              instrument_token: +values[tokenIndex],
              tradingsymbol: values[tradingsymbolIndex],
              name: values[nameIndex],
            };
          })
          .filter(
            (instrument) => instrument.instrument_token && instrument.name
          );
      });
  }

  setInstrument(instrumentToken: number) {
    // Clear existing timer if any
    if (this.timer) {
      clearInterval(this.timer as unknown as number);
      this.timer = null;
    }

    this.instrumentTokens = instrumentToken;
    console.log('Selected Instrument Token:', this.instrumentTokens);
    this.tickData = [];
    this.analysisResult = '';
    this.elapsedSeconds = 0;
    this.lastAnalysisTime = 0; // Reset analysis timer
    this.currentTradeSignal = null; // Clear any existing trade signals

    // destroy existing chart when switching instrument
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    // Start new timer
    this.timer = window.setInterval(() => {
      this.elapsedSeconds++;
    }, 1000); // Update every second

    this.marketStreamService.disconnect();
    this.marketStreamService.connect([this.instrumentTokens]);
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer as unknown as number);
    }
    this.marketStreamService.disconnect();
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  private updateChart() {
    try {
      if (!this.chartCanvas) return;
      const maxPoints = 30;
      const points = this.tickData.slice(-maxPoints);
      const labels = points.map((t) => (t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : ''));
      const prices = points.map((t) => t.currentPrice);

      const ctx = this.chartCanvas.nativeElement.getContext('2d');
      if (!ctx) return;

      // Build price delta array (difference from previous price)
      const deltas: number[] = [];
      for (let i = 0; i < prices.length; i++) {
        if (i === 0) {
          deltas.push(0);
        } else {
          deltas.push(prices[i] - prices[i - 1]);
        }
      }

      // point colors: green for positive, red for negative, gray for zero
      const pointColors = deltas.map((d) => (d > 0 ? 'rgba(16,185,129,0.9)' : d < 0 ? 'rgba(239,68,68,0.9)' : 'rgba(107,114,128,0.8)'));

      if (!this.chart) {
        this.chart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              // Volume bars on secondary axis
              {
                type: 'bar',
                label: 'Volume',
                data: points.map((t) => t.volume ?? 0),
                backgroundColor: 'rgba(148,163,184,0.5)',
                yAxisID: 'y1'
              },
              // Price line on primary axis
              {
                type: 'line',
                label: 'Price',
                data: prices,
                borderColor: 'rgba(59,130,246,0.9)',
                backgroundColor: 'rgba(59,130,246,0.2)',
                tension: 0.2,
                pointRadius: 4,
                pointBackgroundColor: pointColors,
                yAxisID: 'y'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: {
              x: { ticks: { maxRotation: 0, autoSkip: true } },
              y: {
                beginAtZero: false,
                title: { display: true, text: 'Price' }
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Volume' }
              }
            },
            interaction: { mode: 'index', intersect: false }
          }
        });
      } else {
        this.chart.data.labels = labels as unknown as string[];
        // update volume dataset (assumed at index 0) and price dataset (index 1)
        if (this.chart.data.datasets?.[0]) {
          (this.chart.data.datasets[0].data as number[]) = points.map((t) => t.volume ?? 0);
        }
        if (this.chart.data.datasets?.[1]) {
          (this.chart.data.datasets[1].data as number[]) = prices as number[];
          // Chart.js typing is strict; assign per-point colors via any cast
          (this.chart.data.datasets[1] as any).pointBackgroundColor = pointColors;
        }
        this.chart.update();
      }
    } catch (e) {
      console.warn('Chart update error', e);
    }
  }

  // helper: mean price (used by analyzeData)
  private yMean(arr: number[]): number {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  analyzeData(): void {
  if (!this.tickData || this.tickData.length < 2) {
    this.analysisResult = '❗ Not enough data to predict';
    return;
  }

  // prepare basic aggregates
  const open = this.tickData[0].openPrice ?? this.tickData[0].averageTradedPrice ?? 0;
  const lastTick = this.tickData[this.tickData.length - 1];
  const current = lastTick.currentPrice;
  const high = Math.max(...this.tickData.map((t) => t.highPrice ?? t.currentPrice ?? 0));
  const low = Math.min(...this.tickData.map((t) => t.lowPrice ?? t.currentPrice ?? 0));
    
  // Calculate price volatility for dynamic stop loss
  const priceChanges = this.tickData
    .slice(1)
    .map((t, i) => Math.abs(t.currentPrice - this.tickData[i].currentPrice));
  const avgPriceChange = this.yMean(priceChanges);
  const volatilityMultiplier = Math.max(1.5, Math.min(3, avgPriceChange * 2));

  const prices = this.tickData.map((t) => t.currentPrice);

  // helper: linear regression slope (price vs index)
  const slope = (() => {
    const n = prices.length;
    const xs = prices.map((_, i) => i);
    const xMean = (n - 1) / 2;
    const yMean = prices.reduce((s, v) => s + v, 0) / n;
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (prices[i] - yMean);
      den += (xs[i] - xMean) * (xs[i] - xMean);
    }
    return den === 0 ? 0 : num / den;
  })();

  // Volume metrics
  const volumes = this.tickData.map((t) => t.volume ?? 0);
  const avgVolume = volumes.reduce((s, v) => s + v, 0) / Math.max(1, volumes.length);
  const lastVolume = volumes[volumes.length - 1] ?? 0;
  const volumeRatio = avgVolume === 0 ? 1 : lastVolume / avgVolume;

  // order book pressure
  const totalBuy = this.tickData.reduce((sum, t) => sum + (t.totalBuyQuantity ?? 0), 0);
  const totalSell = this.tickData.reduce((sum, t) => sum + (t.totalSellQuantity ?? 0), 0);
  const buySellRatio = totalSell === 0 ? 1 : totalBuy / totalSell;

  // avgTradedPrice deviation
  const computedAvg = prices.reduce((s, v) => s + v, 0) / prices.length;
  const avgTradedPrice = (lastTick.averageTradedPrice ?? computedAvg) || current;
  const avgPriceDev = avgTradedPrice === 0 ? 0 : (current - avgTradedPrice) / avgTradedPrice;

  // momentum and volatility
  const momentum = open === 0 ? 0 : (current - open) / open;
  const volatility = open === 0 ? 0 : (high - low) / open;

  // Normalize slope relative to price scale
  const slopeNorm = (slope / (this.yMean(prices) || 1));

  // feature weights (tweakable)
  const w = {
    slope: 3.0,
    momentum: 4.0,
    buySell: 2.0,
    volume: 1.5,
    avgPriceDev: 1.0,
    volatility: -1.0,
  };

  const score =
    w.slope * slopeNorm +
    w.momentum * momentum +
    w.buySell * (buySellRatio - 1) +
    w.volume * (volumeRatio - 1) +
    w.avgPriceDev * avgPriceDev +
    w.volatility * volatility;

  // map score to probability via sigmoid
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-3 * x));
  const probUp = sigmoid(score);

  // decide label
  const confidence = Math.round((probUp > 0.5 ? probUp : 1 - probUp) * 100);
  const direction = probUp > 0.55 ? 'UP' : probUp < 0.45 ? 'DOWN' : 'NEUTRAL';
  
  // Calculate trade parameters
  if (confidence >= 65 && direction !== 'NEUTRAL') {
    const type = direction === 'UP' ? 'BUY' : 'SELL';
    const expectedMove = avgPriceChange * volatilityMultiplier;
    const stopLossDistance = expectedMove * (type === 'BUY' ? -1 : 1);
    const targetDistance = expectedMove * (type === 'BUY' ? 2 : -2); // 2:1 reward:risk ratio
    
    const newSignal: TradeSignal = {
      type,
      entryPrice: current,
      targetPrice: current + targetDistance,
      stopLoss: current + stopLossDistance,
      confidence,
      timestamp: Date.now()
    };

    // Check if we should update the current trade signal
    if (!this.currentTradeSignal || 
        (this.currentTradeSignal.type !== type && confidence > this.currentTradeSignal.confidence)) {
      this.currentTradeSignal = newSignal;
    }
  }

  // Build analysis result message
  let resultMessage = '';
  const emoji = direction === 'UP' ? '📈' : direction === 'DOWN' ? '📉' : '⚖️';
  
  if (this.currentTradeSignal) {
    const { type, entryPrice, targetPrice, stopLoss } = this.currentTradeSignal;
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(targetPrice - entryPrice);
    const riskRewardRatio = reward / risk;
    
    // Check if trade is active and if exit conditions are met
    if (type === 'BUY') {
      if (current <= stopLoss) {
        resultMessage = `🔴 EXIT BUY: Stop Loss hit at ${stopLoss.toFixed(2)}`;
        this.currentTradeSignal = null;
      } else if (current >= targetPrice) {
        resultMessage = `✅ EXIT BUY: Target reached at ${targetPrice.toFixed(2)}`;
        this.currentTradeSignal = null;
      } else {
        resultMessage = `${emoji} BUY Signal (${confidence}% conf)\n` +
                       `Entry: ${entryPrice.toFixed(2)} | ` +
                       `Target: ${targetPrice.toFixed(2)} | ` +
                       `Stop: ${stopLoss.toFixed(2)}\n` +
                       `R:R = ${riskRewardRatio.toFixed(2)}:1`;
      }
    } else {
      if (current >= stopLoss) {
        resultMessage = `🔴 EXIT SELL: Stop Loss hit at ${stopLoss.toFixed(2)}`;
        this.currentTradeSignal = null;
      } else if (current <= targetPrice) {
        resultMessage = `✅ EXIT SELL: Target reached at ${targetPrice.toFixed(2)}`;
        this.currentTradeSignal = null;
      } else {
        resultMessage = `${emoji} SELL Signal (${confidence}% conf)\n` +
                       `Entry: ${entryPrice.toFixed(2)} | ` +
                       `Target: ${targetPrice.toFixed(2)} | ` +
                       `Stop: ${stopLoss.toFixed(2)}\n` +
                       `R:R = ${riskRewardRatio.toFixed(2)}:1`;
      }
    }
  } else {
    resultMessage = `${emoji} ${direction} (${confidence}% conf)\nWaiting for strong signal...`;
  }

  this.analysisResult = resultMessage;

  console.log('Trade Analysis', {
    open,
    current,
    high,
    low,
    slope,
    slopeNorm,
    momentum,
    volatility,
    avgVolume,
    lastVolume,
    volumeRatio,
    buySellRatio,
    avgPriceDev,
    score,
    probUp,
    avgPriceChange,
    volatilityMultiplier,
    currentSignal: this.currentTradeSignal
  });
}
}
