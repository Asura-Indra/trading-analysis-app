import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  OnChanges, 
  SimpleChanges,
  ViewChild, 
  ElementRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  IPriceLine,
  CandlestickSeries, 
  LineSeries,
  HistogramSeries,
  ColorType, 
  Time,
  CrosshairMode
} from 'lightweight-charts';
import { HistoricalDataService, HistoricalCandle } from '../../services/historical-data.service';
import { ChartDrawingService, DrawingTool } from '../../services/chart-drawing.service';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { LineStyle } from 'lightweight-charts';

export interface TickData {
  timestamp?: number;
  currentPrice?: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  closePrice?: number;
  volume?: number;
}

export type Timeframe = 'minute' | 'hour' | 'day';

@Component({
  selector: 'app-trading-chart',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    ButtonModule,
    SelectModule,
    CheckboxModule,
    InputNumberModule,
    DialogModule
  ],
  templateUrl: './trading-chart.component.html',
  styleUrls: ['./trading-chart.component.less']
})
export class TradingChartComponent implements OnInit, OnChanges, OnDestroy {
  @Input() instrumentToken: number | null = null;
  @Input() tickData: TickData[] = [];
  @Input() historicalDays = 60; // Default to 60 days of historical data

  @ViewChild('chartContainer', { static: false }) chartContainer!: ElementRef<HTMLDivElement>;

  private historicalDataService = inject(HistoricalDataService);
  private drawingService = inject(ChartDrawingService);
  private chart: IChartApi | null = null;
  private candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private smaSeries: ISeriesApi<'Line'> | null = null;
  private emaSeries: ISeriesApi<'Line'> | null = null;
  private historicalDataLoaded = false;
  private historicalCandles: HistoricalCandle[] = [];
  private handlersAttached = false;

  // Chart controls
  currentTimeframe: Timeframe = 'minute';
  showVolume = true;
  showSMA = false;
  showEMA = false;
  smaPeriod = 20;
  emaPeriod = 20;

  // Drawing tools
  selectedDrawingTool: DrawingTool | null = null;
  drawingTools: DrawingTool[] = [];
  isDrawingMode = false;
  previewPriceLine: IPriceLine | null = null;
  draggingLineId: string | null = null;
  isDragging = false;
  dragStartY = 0;
  dragStartPrice = 0;

  // Timeframe options
  timeframeOptions = [
    { label: '1 Minute', value: 'minute' },
    { label: '1 Hour', value: 'hour' },
    { label: '1 Day', value: 'day' }
  ];

  ngOnInit() {
    // Initialize drawing tools
    this.drawingTools = this.drawingService.getDrawingTools();
    
    // Wait for view to initialize before loading data
    setTimeout(() => {
      if (this.instrumentToken && this.chartContainer?.nativeElement) {
        this.loadHistoricalData();
      }
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges) {
    // Handle instrument token change
    if (changes['instrumentToken'] && !changes['instrumentToken'].firstChange) {
      const previousToken = changes['instrumentToken'].previousValue;
      const currentToken = changes['instrumentToken'].currentValue;
      
      if (previousToken !== currentToken && currentToken) {
        this.resetChart();
        this.historicalDataLoaded = false;
       // this.realTimeDataMap.clear();
        this.loadHistoricalData();
      }
    }

    // Handle tick data updates
    if (changes['tickData'] && !changes['tickData'].firstChange && this.historicalDataLoaded) {
      this.updateChartWithRealtimeData();
    }
  }

  ngOnDestroy() {
    this.resetChart();
  }

  private resetChart() {
    // Clean up preview line
    if (this.previewPriceLine && this.candlestickSeries) {
      this.candlestickSeries.removePriceLine(this.previewPriceLine);
      this.previewPriceLine = null;
    }

    if (this.chart) {
      this.chart.remove();
      this.chart = null;
      this.candlestickSeries = null;
      this.volumeSeries = null;
      this.smaSeries = null;
      this.emaSeries = null;
    }

    // Reset drawing state
    this.selectedDrawingTool = null;
    this.isDrawingMode = false;
    this.isDragging = false;
    this.draggingLineId = null;
  }

  private loadHistoricalData() {
    if (!this.instrumentToken || !this.chartContainer?.nativeElement) {
      // Retry if container not ready
      setTimeout(() => {
        if (this.instrumentToken && this.chartContainer?.nativeElement) {
          this.loadHistoricalData();
        }
      }, 100);
      return;
    }

    this.historicalDataService
      .getHistoricalDataForDays(this.instrumentToken, this.historicalDays, this.currentTimeframe)
      .subscribe({
        next: (candles: HistoricalCandle[]) => {
          this.historicalCandles = candles;
          if (candles.length > 0) {
            this.initializeChart(candles);
            this.historicalDataLoaded = true;
            // After historical data is loaded, update with any existing real-time data
            if (this.tickData.length > 0) {
              this.updateChartWithRealtimeData();
            }
          } else {
            console.warn('No historical data received');
            // Initialize empty chart anyway
            this.initializeChart([]);
            this.historicalDataLoaded = true;
          }
        },
        error: (error) => {
          console.error('Error fetching historical data:', error);
          // Initialize empty chart on error
          this.initializeChart([]);
          this.historicalDataLoaded = true;
        }
      });
  }

  onTimeframeChange() {
    if (this.instrumentToken) {
      this.resetChart();
      this.historicalDataLoaded = false;
      this.loadHistoricalData();
    }
  }

  onVolumeToggle() {
    if (this.chart && this.historicalCandles.length > 0) {
      if (this.showVolume) {
        this.addVolumeSeries();
      } else {
        this.removeVolumeSeries();
      }
    }
  }

  onSMAToggle() {
    if (this.chart && this.historicalCandles.length > 0) {
      if (this.showSMA) {
        this.addSMASeries();
      } else {
        this.removeSMASeries();
      }
    }
  }

  onEMAToggle() {
    if (this.chart && this.historicalCandles.length > 0) {
      if (this.showEMA) {
        this.addEMASeries();
      } else {
        this.removeEMASeries();
      }
    }
  }

  private initializeChart(historicalCandles: HistoricalCandle[]) {
    if (!this.chartContainer?.nativeElement) {
      return;
    }

    try {
      const containerWidth = this.chartContainer.nativeElement.clientWidth || 800;
      
      // Create chart with enhanced options
      this.chart = createChart(this.chartContainer.nativeElement, {
        layout: {
          background: { type: ColorType.Solid, color: '#ffffff' },
          textColor: '#333',
          fontSize: 12,
        },
        width: containerWidth,
        height: 500,
        grid: {
          vertLines: { 
            color: '#e0e0e0',
            style: 1, // LineStyle.Solid
            visible: true
          },
          horzLines: { 
            color: '#e0e0e0',
            style: 1,
            visible: true
          },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: '#758696',
            width: 1,
            style: 3, // LineStyle.LargeDashed
            labelBackgroundColor: '#26a69a',
          },
          horzLine: {
            color: '#758696',
            width: 1,
            style: 3,
            labelBackgroundColor: '#26a69a',
          },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: '#d1d4dc',
        },
        rightPriceScale: {
          borderColor: '#d1d4dc',
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
      });

      // Create candlestick series
      this.candlestickSeries = this.chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        priceScaleId: 'right',
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });

      // Set historical data
      if (historicalCandles.length > 0) {
        const chartData = historicalCandles.map(candle => ({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        }));
        
        this.candlestickSeries.setData(chartData);
        
        // Add volume series if enabled
        if (this.showVolume) {
          this.addVolumeSeries();
        }
        
        // Add indicators if enabled
        if (this.showSMA) {
          this.addSMASeries();
        }
        if (this.showEMA) {
          this.addEMASeries();
        }
        
        this.chart.timeScale().fitContent();
      }

      // Setup mouse event handlers for drawing
      this.setupDrawingHandlers();
    } catch (e) {
      console.warn('Chart initialization error', e);
    }
  }

  private setupDrawingHandlers() {
    if (!this.chartContainer?.nativeElement || !this.chart || !this.candlestickSeries) {
      return;
    }

    // Attach handlers only once to avoid duplicates across timeframe/instrument changes
    if (this.handlersAttached) {
      return;
    }

    const container = this.chartContainer.nativeElement;

    // Mouse move handler for preview and hover detection
    container.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.chart || !this.candlestickSeries) {
        return;
      }

      if (this.isDragging && this.draggingLineId) {
        // Handle dragging existing line
        this.handleLineDrag(e);
        return;
      }

      // Check if hovering over an existing line (for cursor change)
      if (!this.isDrawingMode) {
        const rect = container.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const price = this.coordinateToPrice(y);
        
        if (price !== null) {
          const priceRange = this.chart.priceScale('right').getVisibleRange();
          if (priceRange) {
            const tolerance = 5;
            const pricePerPixel = (priceRange.to - priceRange.from) / (rect.height * 0.8);
            const priceTolerance = pricePerPixel * tolerance;
            const line = this.drawingService.findHorizontalLineNearPrice(price, priceTolerance);
            
            if (line) {
              container.style.cursor = 'ns-resize';
            } else {
              container.style.cursor = 'default';
            }
          }
        }
      }

      if (this.isDrawingMode) {
        if (this.selectedDrawingTool?.type === 'horizontal-line') {
          this.updatePreviewLine(e);
        }
      }
    });

    // Mouse down for drag start or line creation
    container.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.chart || !this.candlestickSeries) {
        return;
      }

      // Check if clicking on an existing line to drag
      if (this.checkLineClick(e, true)) {
        e.preventDefault();
        return; // Drag started, will be handled by mousemove
      }

      // If in drawing mode and not clicking on existing line, create new line
      if (this.isDrawingMode && this.selectedDrawingTool?.type === 'horizontal-line') {
        this.createHorizontalLineFromClick(e);
      }
    });

    // Mouse up to end drag
    container.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.draggingLineId = null;
      if (this.chartContainer?.nativeElement) {
        this.chartContainer.nativeElement.style.cursor = this.isDrawingMode ? 'crosshair' : 'default';
      }
    });

    // Prevent context menu when right-clicking on lines (for future delete functionality)
    container.addEventListener('contextmenu', (e: MouseEvent) => {
      if (this.isDrawingMode || this.isDragging) {
        e.preventDefault();
      }
    });

    // Mouse leave to clean up preview
    container.addEventListener('mouseleave', () => {
      if (this.previewPriceLine && this.candlestickSeries) {
        this.candlestickSeries.removePriceLine(this.previewPriceLine);
        this.previewPriceLine = null;
      }
    });

    this.handlersAttached = true;
  }

  private updatePreviewLine(e: MouseEvent) {
    if (!this.chart || !this.candlestickSeries) {
      return;
    }

    const rect = this.chartContainer?.nativeElement?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const price = this.coordinateToPrice(y);
    if (price === null) {
      return;
    }

    // Create or update preview line
    if (this.previewPriceLine) {
      this.previewPriceLine.applyOptions({
        price,
        lineVisible: true,
      });
    } else {
      this.previewPriceLine = this.candlestickSeries.createPriceLine({
        price,
        color: '#999999',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        lineVisible: true,
      });
    }
  }

  private createHorizontalLineFromClick(e: MouseEvent) {
    if (!this.chart || !this.candlestickSeries) {
      return;
    }

    const rect = this.chartContainer?.nativeElement?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;

    const price = this.coordinateToPrice(y);
    if (price === null) {
      return;
    }

    // Remove preview line
    if (this.previewPriceLine) {
      this.candlestickSeries.removePriceLine(this.previewPriceLine);
      this.previewPriceLine = null;
    }

    // Create actual line
    this.drawingService.addHorizontalLine(
      this.candlestickSeries,
      price,
      {
        color: '#2196F3',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: `Price: ${price.toFixed(2)}`
      }
    );
  }

  private checkLineClick(e: MouseEvent, isDragStart = false): boolean {
    if (!this.chart || !this.candlestickSeries) {
      return false;
    }

    const rect = this.chartContainer?.nativeElement?.getBoundingClientRect();
    if (!rect) return false;

    const y = e.clientY - rect.top;
    const price = this.coordinateToPrice(y);

    if (price === null) {
      return false;
    }

    // Check if clicking near an existing line (within 5 pixels tolerance)
    const tolerance = 5;
    const priceRange = this.chart.priceScale('right').getVisibleRange();
    if (!priceRange) {
      return false;
    }

    const pricePerPixel = (priceRange.to - priceRange.from) / (rect.height * 0.8);
    const priceTolerance = pricePerPixel * tolerance;

    const line = this.drawingService.findHorizontalLineNearPrice(price, priceTolerance);
    if (line) {
      if (isDragStart) {
        this.isDragging = true;
        this.draggingLineId = line.id;
        this.dragStartY = y;
        this.dragStartPrice = line.price;
        if (this.chartContainer?.nativeElement) {
          this.chartContainer.nativeElement.style.cursor = 'ns-resize';
        }
      }
      return true;
    }

    return false;
  }

  private handleLineDrag(e: MouseEvent) {
    if (!this.chart || !this.candlestickSeries || !this.draggingLineId) {
      return;
    }

    const rect = this.chartContainer?.nativeElement?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const price = this.coordinateToPrice(y);

    if (price === null) {
      return;
    }

    // Update line position
    this.drawingService.updateHorizontalLinePrice(
      this.candlestickSeries,
      this.draggingLineId,
      price
    );
  }

  private addVolumeSeries() {
    if (!this.chart || !this.historicalCandles.length) return;

    try {
      // Remove existing volume series if any
      if (this.volumeSeries) {
        this.chart.removeSeries(this.volumeSeries);
      }

      // Create volume histogram in a separate pane
      this.volumeSeries = this.chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: 'volume',
      });

      // Configure the volume price scale to show at bottom
      this.chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.7,
          bottom: 0,
        },
      });

      // Prepare volume data
      const volumeData = this.historicalCandles.map(candle => ({
        time: candle.time as Time,
        value: candle.volume,
        color: candle.close >= candle.open ? '#26a69a' : '#ef5350',
      }));

      this.volumeSeries.setData(volumeData);
    } catch (e) {
      console.warn('Error adding volume series', e);
    }
  }

  private removeVolumeSeries() {
    if (this.volumeSeries && this.chart) {
      this.chart.removeSeries(this.volumeSeries);
      this.volumeSeries = null;
    }
  }

  private calculateSMA(period: number): Array<{ time: Time; value: number }> {
    if (!this.historicalCandles.length || period > this.historicalCandles.length) {
      return [];
    }

    const smaData: Array<{ time: Time; value: number }> = [];
    
    for (let i = period - 1; i < this.historicalCandles.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += this.historicalCandles[j].close;
      }
      const sma = sum / period;
      smaData.push({
        time: this.historicalCandles[i].time as Time,
        value: sma
      });
    }

    return smaData;
  }

  private calculateEMA(period: number): Array<{ time: Time; value: number }> {
    if (!this.historicalCandles.length || period > this.historicalCandles.length) {
      return [];
    }

    const emaData: Array<{ time: Time; value: number }> = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += this.historicalCandles[i].close;
    }
    let ema = sum / period;
    emaData.push({
      time: this.historicalCandles[period - 1].time as Time,
      value: ema
    });

    // Calculate EMA for remaining values
    for (let i = period; i < this.historicalCandles.length; i++) {
      ema = (this.historicalCandles[i].close - ema) * multiplier + ema;
      emaData.push({
        time: this.historicalCandles[i].time as Time,
        value: ema
      });
    }

    return emaData;
  }

  private addSMASeries() {
    if (!this.chart || !this.historicalCandles.length) return;

    try {
      if (this.smaSeries) {
        this.chart.removeSeries(this.smaSeries);
      }

      this.smaSeries = this.chart.addSeries(LineSeries, {
        color: '#2196F3',
        lineWidth: 2,
        title: `SMA(${this.smaPeriod})`,
        priceScaleId: 'right',
      });

      const smaData = this.calculateSMA(this.smaPeriod);
      if (smaData.length > 0) {
        this.smaSeries.setData(smaData);
      }
    } catch (e) {
      console.warn('Error adding SMA series', e);
    }
  }

  private removeSMASeries() {
    if (this.smaSeries && this.chart) {
      this.chart.removeSeries(this.smaSeries);
      this.smaSeries = null;
    }
  }

  private addEMASeries() {
    if (!this.chart || !this.historicalCandles.length) return;

    try {
      if (this.emaSeries) {
        this.chart.removeSeries(this.emaSeries);
      }

      this.emaSeries = this.chart.addSeries(LineSeries, {
        color: '#FF9800',
        lineWidth: 2,
        title: `EMA(${this.emaPeriod})`,
        priceScaleId: 'right',
      });

      const emaData = this.calculateEMA(this.emaPeriod);
      if (emaData.length > 0) {
        this.emaSeries.setData(emaData);
      }
    } catch (e) {
      console.warn('Error adding EMA series', e);
    }
  }

  private removeEMASeries() {
    if (this.emaSeries && this.chart) {
      this.chart.removeSeries(this.emaSeries);
      this.emaSeries = null;
    }
  }

  private updateChartWithRealtimeData() {
    if (!this.candlestickSeries || !this.chart || this.tickData.length === 0) {
      return;
    }

    try {
      // Get the latest tick data
      const latestTick = this.tickData[this.tickData.length - 1];
      
      if (!latestTick.timestamp || !latestTick.currentPrice) {
        return;
      }

      const timestamp = latestTick.timestamp;
      const time = Math.floor(timestamp / 1000) as Time;
      
      // Use OHLC data if available, otherwise use currentPrice for all
      const open = latestTick.openPrice ?? latestTick.currentPrice ?? 0;
      const high = latestTick.highPrice ?? latestTick.currentPrice ?? 0;
      const low = latestTick.lowPrice ?? latestTick.currentPrice ?? 0;
      const close = latestTick.closePrice ?? latestTick.currentPrice ?? 0;

      if (open > 0 && high > 0 && low > 0 && close > 0) {
        const candle = {
          time,
          open,
          high: Math.max(open, high, close, low),
          low: Math.min(open, low, close, high),
          close
        };

        // Update the last candle with the latest tick data
        // This will update if the time matches, or add a new candle if it doesn't
        this.candlestickSeries.update(candle);
        
        // Scroll to show the latest data
        this.chart.timeScale().scrollToPosition(-1, false);
      }
    } catch (e) {
      console.warn('Chart update error', e);
    }
  }

  // Drawing tools methods
  selectDrawingTool(tool: DrawingTool) {
    // Deselect if clicking the same tool
    if (this.selectedDrawingTool?.id === tool.id) {
      this.deselectDrawingTool();
      return;
    }

    this.selectedDrawingTool = tool;
    this.isDrawingMode = true;

    if (this.chartContainer?.nativeElement) {
      this.chartContainer.nativeElement.style.cursor = 'crosshair';
    }

    // Clean up any existing preview
    if (this.previewPriceLine && this.candlestickSeries) {
      this.candlestickSeries.removePriceLine(this.previewPriceLine);
      this.previewPriceLine = null;
    }
  }

  deselectDrawingTool() {
    this.selectedDrawingTool = null;
    this.isDrawingMode = false;

    if (this.chartContainer?.nativeElement) {
      this.chartContainer.nativeElement.style.cursor = 'default';
    }

    // Clean up preview line
    if (this.previewPriceLine && this.candlestickSeries) {
      this.candlestickSeries.removePriceLine(this.previewPriceLine);
      this.previewPriceLine = null;
    }
  }

  /**
   * Delete a horizontal line (can be called from UI)
   * For now, users can clear all. Individual deletion can be added later with right-click menu
   */
  deleteHorizontalLine(id: string) {
    if (this.candlestickSeries) {
      this.drawingService.removeHorizontalLine(this.candlestickSeries, id);
    }
  }

  clearAllDrawings() {
    if (this.candlestickSeries) {
      this.drawingService.clearAll(this.candlestickSeries);
    }
  }

  getCurrentPrice(): number | null {
    if (this.historicalCandles.length > 0) {
      return this.historicalCandles[this.historicalCandles.length - 1].close;
    }
    if (this.tickData.length > 0) {
      const lastTick = this.tickData[this.tickData.length - 1];
      return lastTick.currentPrice || lastTick.closePrice || null;
    }
    return null;
  }

  /**
   * Convert y coordinate (pixel) to price value
   * Accounts for chart margins and price scale position
   */
  private coordinateToPrice(y: number): number | null {
    if (!this.chart || !this.candlestickSeries) {
      return null;
    }

    // Get visible price range
    const priceRange = this.chart.priceScale('right').getVisibleRange();
    if (!priceRange) {
      return null;
    }

    // Get chart dimensions
    const chartHeight = this.chartContainer?.nativeElement?.clientHeight || 500;
    
    // Account for chart margins (top and bottom margins from price scale config)
    // The chart pane is typically 80% of the height (with 10% margins top and bottom)
    const marginTop = chartHeight * 0.1;
    const marginBottom = chartHeight * 0.1;
    const chartPaneHeight = chartHeight - marginTop - marginBottom;
    
    // Calculate price per pixel
    const priceRangeSize = priceRange.to - priceRange.from;
    const pricePerPixel = priceRangeSize / chartPaneHeight;
    
    // Convert y coordinate to price
    // y=0 is at top, but price scale is inverted (high price at top)
    const relativeY = y - marginTop;
    const price = priceRange.to - (relativeY * pricePerPixel);
    
    return price;
  }
}

