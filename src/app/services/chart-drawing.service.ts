import { Injectable } from '@angular/core';
import { IPriceLine, ISeriesApi, Time, LineStyle, LineWidth } from 'lightweight-charts';

export interface DrawingTool {
  id: string;
  type: 'horizontal-line' | 'trend-line' | 'vertical-line' | 'rectangle' | 'text';
  name: string;
  icon?: string;
}

export interface HorizontalLine {
  id: string;
  price: number;
  color: string;
  lineWidth: LineWidth;
  lineStyle: LineStyle;
  title?: string;
  priceLine: IPriceLine;
  isDragging?: boolean;
}

export interface TrendLine {
  id: string;
  startTime: Time;
  startPrice: number;
  endTime: Time;
  endPrice: number;
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
}

export interface VerticalLine {
  id: string;
  time: Time;
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
}

export interface Rectangle {
  id: string;
  startTime: Time;
  startPrice: number;
  endTime: Time;
  endPrice: number;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChartDrawingService {
  private horizontalLines: Map<string, HorizontalLine> = new Map();
  private trendLines: Map<string, TrendLine> = new Map();
  private verticalLines: Map<string, VerticalLine> = new Map();
  private rectangles: Map<string, Rectangle> = new Map();

  /**
   * Available drawing tools
   */
  getDrawingTools(): DrawingTool[] {
    return [
      { id: 'horizontal-line', type: 'horizontal-line', name: 'Horizontal Line', icon: 'pi-minus' },
      { id: 'trend-line', type: 'trend-line', name: 'Trend Line', icon: 'pi-arrow-up-right' },
      { id: 'vertical-line', type: 'vertical-line', name: 'Vertical Line', icon: 'pi-arrow-right' },
      { id: 'rectangle', type: 'rectangle', name: 'Rectangle', icon: 'pi-square' },
    ];
  }

  /**
   * Add a horizontal price line
   */
  addHorizontalLine(
    series: ISeriesApi<'Candlestick' | 'Line' | 'Area'>,
    price: number,
    options?: {
      color?: string;
      lineWidth?: LineWidth;
      lineStyle?: LineStyle;
      title?: string;
    }
  ): string {
    const id = `hl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // Ensure lineWidth is a valid LineWidth value (1, 2, 3, or 4)
    const validLineWidth: LineWidth = (options?.lineWidth && [1, 2, 3, 4].includes(options.lineWidth as number))
      ? (options.lineWidth as LineWidth)
      : 2;
    
    const priceLine = series.createPriceLine({
      price,
      color: options?.color || '#2196F3',
      lineWidth: validLineWidth,
      lineStyle: options?.lineStyle || LineStyle.Solid,
      axisLabelVisible: true,
      title: options?.title || `Price: ${price.toFixed(2)}`,
    });

    this.horizontalLines.set(id, {
      id,
      price,
      color: options?.color || '#2196F3',
      lineWidth: validLineWidth,
      lineStyle: options?.lineStyle || LineStyle.Solid,
      title: options?.title,
      priceLine,
    });

    return id;
  }

  /**
   * Remove a horizontal line
   */
  removeHorizontalLine(series: ISeriesApi<'Candlestick' | 'Line' | 'Area'>, id: string): boolean {
    const line = this.horizontalLines.get(id);
    if (line) {
      series.removePriceLine(line.priceLine);
      this.horizontalLines.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Get all horizontal lines
   */
  getHorizontalLines(): HorizontalLine[] {
    return Array.from(this.horizontalLines.values());
  }

  /**
   * Clear all horizontal lines
   */
  clearHorizontalLines(series: ISeriesApi<'Candlestick' | 'Line' | 'Area'>): void {
    this.horizontalLines.forEach((line) => {
      series.removePriceLine(line.priceLine);
    });
    this.horizontalLines.clear();
  }

  /**
   * Add a trend line (stored for future primitive implementation)
   */
  addTrendLine(trendLine: Omit<TrendLine, 'id'>): string {
    const id = `tl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.trendLines.set(id, { ...trendLine, id });
    return id;
  }

  /**
   * Get all trend lines
   */
  getTrendLines(): TrendLine[] {
    return Array.from(this.trendLines.values());
  }

  /**
   * Remove a trend line
   */
  removeTrendLine(id: string): boolean {
    return this.trendLines.delete(id);
  }

  /**
   * Update horizontal line price (for dragging)
   */
  updateHorizontalLinePrice(
    series: ISeriesApi<'Candlestick' | 'Line' | 'Area'>,
    id: string,
    newPrice: number
  ): boolean {
    const line = this.horizontalLines.get(id);
    if (line) {
      line.price = newPrice;
      line.priceLine.applyOptions({
        price: newPrice,
        title: line.title || `Price: ${newPrice.toFixed(2)}`,
      });
      return true;
    }
    return false;
  }

  /**
   * Get horizontal line by ID
   */
  getHorizontalLine(id: string): HorizontalLine | undefined {
    return this.horizontalLines.get(id);
  }

  /**
   * Find horizontal line near a price (for hit testing)
   */
  findHorizontalLineNearPrice(price: number, tolerance: number = 0.01): HorizontalLine | null {
    for (const line of this.horizontalLines.values()) {
      if (Math.abs(line.price - price) <= tolerance) {
        return line;
      }
    }
    return null;
  }

  /**
   * Clear all drawings
   */
  clearAll(series: ISeriesApi<'Candlestick' | 'Line' | 'Area'>): void {
    this.clearHorizontalLines(series);
    this.trendLines.clear();
    this.verticalLines.clear();
    this.rectangles.clear();
  }
}

