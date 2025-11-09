import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { MarketDataPacket } from '../../services/market-stream.service';
import { IconFieldModule } from 'primeng/iconfield';
import { InputTextModule } from 'primeng/inputtext';
import { InputIconModule } from 'primeng/inputicon';
import { MarketStreamService } from '../../services/market-stream.service';
import { TradingSystem, Tick, TradeSignal } from '../../services/trading-system.service';
import { TradingChartComponent, TickData } from '../trading-chart/trading-chart.component';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { debounceTime } from 'rxjs';

interface Instrument {
  instrument_token: number;
  name: string;
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
    DialogModule,
    TradingChartComponent,
  ],
})
export class TradingListComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  public marketStreamService = inject(MarketStreamService);
  instruments: Instrument[] = [];
  analysisResult = '';
  instrumentTokens: number | null = null;
  elapsedSeconds = 0;
  public tickData: TickData[] = [];
  private timer: number | null = null;
  displayDialog = false;
  selectedInstrument: Instrument | null = null;
  
  // Trade analysis properties - using the new TradingSystem
  private tradingSystem: TradingSystem | null = null;
  private currentTradeSignal: TradeSignal | null = null;

  get elapsedTime(): { minutes: number; seconds: number } {
    return {
      minutes: Math.floor(this.elapsedSeconds / 60),
      seconds: this.elapsedSeconds % 60,
    };
  }

  ngOnInit() {
    this.loadInstruments();
    // Initialize trading system with a window size of 200 ticks
    this.tradingSystem = new TradingSystem(200);
    
    this.marketStreamService.messageData.pipe(debounceTime(5000)).subscribe((data) => {
      if (data?.length) {
        // Convert MarketDataPacket to TickData format
        const ticksWithTimestamp: TickData[] = data.map((tick: MarketDataPacket) => ({
          timestamp: Date.now(), // Use current timestamp since MarketDataPacket doesn't have one
          currentPrice: tick.currentPrice || 0,
          openPrice: tick.openPrice || 0,
          highPrice: tick.highPrice || 0,
          lowPrice: tick.lowPrice || 0,
          closePrice: tick.closePrice || 0,
          volume: tick.volume || 0,
        }));
        this.tickData.push(...ticksWithTimestamp);
        
        // Process each tick through the new trading system
        ticksWithTimestamp.forEach((rawTick: TickData) => {
          if (this.tradingSystem) {
            // Map raw tick data to Tick interface
            const tick: Tick = {
              timestamp: rawTick.timestamp || Date.now(),
              currentPrice: rawTick.currentPrice || 0,
              volume: rawTick.volume || 0,
              totalBuyQuantity: 0, // These might not be in TickData, keeping for compatibility
              totalSellQuantity: 0,
            };
            
            // Only process valid ticks
            if (tick.currentPrice > 0) {
              this.tradingSystem.onTick(tick);
              // Update analysis result from the trading system
              this.analysisResult = this.tradingSystem.analysisResult;
              this.currentTradeSignal = this.tradingSystem.getCurrentTradeSignal();
            }
          }
        });
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

  setInstrument(instrument: Instrument) {
    // Clear existing timer if any
    if (this.timer) {
      clearInterval(this.timer as unknown as number);
      this.timer = null;
    }

    this.selectedInstrument = instrument;
    this.instrumentTokens = instrument.instrument_token;
    console.log('Selected Instrument Token:', this.instrumentTokens);
    this.tickData = [];
    this.analysisResult = '';
    this.elapsedSeconds = 0;
    this.currentTradeSignal = null;

    // Reset trading system for new instrument
    if (this.tradingSystem) {
      this.tradingSystem.reset();
    } else {
      this.tradingSystem = new TradingSystem(200);
    }

    // Start new timer
    this.timer = window.setInterval(() => {
      this.elapsedSeconds++;
    }, 1000);

    this.marketStreamService.disconnect();
    this.marketStreamService.connect([this.instrumentTokens]);
    
    // Show the dialog
    this.displayDialog = true;
  }

  onDialogHide() {
    // Clean up when dialog is closed
    if (this.timer) {
      clearInterval(this.timer as unknown as number);
      this.timer = null;
    }
    this.marketStreamService.disconnect();
    this.instrumentTokens = null;
    this.tickData = [];
    this.elapsedSeconds = 0;
    this.analysisResult = '';
    this.currentTradeSignal = null;
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer as unknown as number);
    }
    this.marketStreamService.disconnect();
  }
  analyzeData() {
    // Analysis is already being performed automatically via tradingSystem
    // This method is kept for the button click handler
    if (this.tradingSystem) {
      this.analysisResult = this.tradingSystem.analysisResult;
      this.currentTradeSignal = this.tradingSystem.getCurrentTradeSignal();
    }
  }
}
