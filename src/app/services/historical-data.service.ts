import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface HistoricalCandle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ZerodhaHistoricalResponse {
  status: string;
  data: {
    candles: Array<[
      string,  // ISO 8601 timestamp: "2025-09-10T09:15:00+0530"
      number,  // open
      number,  // high
      number,  // low
      number,  // close
      number,  // volume
      number   // oi (open interest)
    ]>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class HistoricalDataService {
  private http = inject(HttpClient);
  
  // Proxy server URL - change this if your proxy runs on a different port
  private readonly PROXY_BASE_URL = 'http://localhost:3001/api';

  /**
   * Fetches historical minute data for an instrument
   * @param instrumentToken - The instrument token
   * @param fromDate - Start date in YYYY-MM-DD format
   * @param toDate - End date in YYYY-MM-DD format
   * @param interval - Time interval (minute, day, etc.) - default is 'minute'
   * @returns Observable of historical candle data
   */
  getHistoricalData(
    instrumentToken: number,
    fromDate: string,
    toDate: string,
    interval = 'minute'
  ): Observable<HistoricalCandle[]> {
    // Use proxy server endpoint
    const url = `${this.PROXY_BASE_URL}/historical/${instrumentToken}/${interval}`;
    const params = {
      oi: '1',
      from: fromDate,
      to: toDate
    };

    // Proxy server handles authentication, so we just need to pass query params
    return this.http.get<ZerodhaHistoricalResponse>(url, { 
      params
    }).pipe(
      map((response) => {
        if (response.status === 'success' && response.data?.candles) {
          // Zerodha returns candles as: [ISO_timestamp_string, open, high, low, close, volume, oi]
          return response.data.candles.map((candle) => {
            // Parse ISO 8601 timestamp string (e.g., "2025-09-10T09:15:00+0530") to Unix timestamp (seconds)
            const timestamp = new Date(candle[0]).getTime() / 1000;
            
            return {
              time: Math.floor(timestamp), // Unix timestamp in seconds
              open: candle[1],
              high: candle[2],
              low: candle[3],
              close: candle[4],
              volume: candle[5] || 0
            };
          });
        }
        return [];
      })
    );
  }

  /**
   * Gets historical data for the last N days
   * @param instrumentToken - The instrument token
   * @param days - Number of days to fetch (default: 60 days)
   * @param interval - Time interval (default: 'minute')
   */
  getHistoricalDataForDays(
    instrumentToken: number,
    days = 60,
    interval = 'minute'
  ): Observable<HistoricalCandle[]> {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const fromDateStr = this.formatDate(fromDate);
    const toDateStr = this.formatDate(toDate);

    return this.getHistoricalData(instrumentToken, fromDateStr, toDateStr, interval);
  }

  /**
   * Formats a Date object to YYYY-MM-DD string
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

