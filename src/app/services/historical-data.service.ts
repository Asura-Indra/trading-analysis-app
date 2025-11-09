import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

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
  private authService = inject(AuthService);
  
  // Proxy server URL - change this if your proxy runs on a different port
  private readonly PROXY_BASE_URL = 'http://localhost:3001/api';
  
  private getAuthHeaders(): { headers: HttpHeaders } {
    const enctoken = localStorage.getItem('enctoken');
    if (!enctoken) {
      this.authService.logout();
      throw new Error('No authentication token found');
    }
    
    return {
      headers: new HttpHeaders({
        'Authorization': `enctoken ${enctoken}`,
        'Content-Type': 'application/json'
      })
    };
  }

  /**
   * Fetches historical minute data for an instrument
   * @param instrumentToken - The instrument token
   * @param fromDate - Start date in YYYY-MM-DD format
   * @param toDate - End date in YYYY-MM-DD format
   * @param interval - Time interval (minute, day, etc.) - default is 'minute'
   * @returns Observable of historical candle data
   */
  getHistoricalData(
    instrumentToken: number | string,
    fromDate: string,
    toDate: string,
    interval = 'minute'
  ): Observable<HistoricalCandle[]> {
    const url = `${this.PROXY_BASE_URL}/historical/${instrumentToken}/${interval}?from=${fromDate}&to=${toDate}`;
    
    return this.http.get<ZerodhaHistoricalResponse>(url, this.getAuthHeaders()).pipe(
      map(response => this.transformResponse(response)),
      catchError(error => {
        console.error('Error fetching historical data:', error);
        if (error.status === 401) {
          this.authService.logout();
        }
        return throwError(() => new Error('Failed to fetch historical data'));
      })
    );
  }
  
  private transformResponse(response: ZerodhaHistoricalResponse): HistoricalCandle[] {
    if (!response?.data?.candles) {
      console.warn('No candle data in response');
      return [];
    }
    
    try {
      return response.data.candles.map(candle => ({
        time: Math.floor(new Date(candle[0]).getTime() / 1000), // Convert to Unix timestamp
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (error) {
      console.error('Error transforming response:', error);
      return [];
    }
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

