import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { AuthService } from './auth.service';

export interface MarketDataPacket {
  instrumentToken: number;
  currentPrice: number;
  averageTradedPrice: number;
  volume: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
}

@Injectable({
  providedIn: 'root'
})
export class MarketStreamService {
  private socket: WebSocket | null = null;
  private readonly API_KEY = 'kitefront';
  public messageData = new BehaviorSubject<MarketDataPacket[]>([]);
  private connectionStatus = new Subject<boolean>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000; // 3 seconds
  private authService = inject(AuthService);
  private instrumentTokens: number[] = [];

  constructor() {
    // Subscribe to auth state changes to handle logout
    this.authService.getAuthState().subscribe(state => {
      if (!state.isAuthenticated) {
        this.disconnect();
      }
    });
  }

  getMessageData(): Observable<MarketDataPacket[]> {
    return this.messageData.asObservable();
  }

  getConnectionStatus(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  private subscribeToInstruments(instrumentTokens: number[]): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    const msg = { 
      a: 'subscribe', 
      v: [...new Set(instrumentTokens)] // Remove duplicates
    };
    
    this.socket.send(JSON.stringify(msg));
    console.log(' Subscribed to instruments:', msg.v);
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.instrumentTokens.length > 0) {
        this.connect(this.instrumentTokens);
      }
    }, Math.min(delay, 30000)); // Max delay of 30 seconds
  }

  connect(instrumentTokens: number[]): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.instrumentTokens = instrumentTokens;
    const enctoken = localStorage.getItem('enctoken');
    const urlEncodedToken = encodeURIComponent(enctoken);
    const userId = localStorage.getItem('user_id');

    if (!enctoken || !userId) {
      console.error('No authentication token or user ID found');
      return;
    }

    const url = `wss://ws.zerodha.com/?api_key=${this.API_KEY}&user_id=${userId}&enctoken=${urlEncodedToken}&uid=${Date.now()}&user-agent=kite3-web&version=3.0.0`;

    try {
      this.socket = new WebSocket(url);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        console.log('✅ Connected to Zerodha WebSocket');
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        this.connectionStatus.next(true);
        
        // Subscribe to instruments
        if (this.instrumentTokens.length > 0) {
          this.subscribeToInstruments(this.instrumentTokens);
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const packets = this.decodeZerodhaTick(event.data);
          if (packets?.length) {
            this.messageData.next(packets);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      this.socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.connectionStatus.next(false);
        this.handleReconnect();
      };

      this.socket.onclose = () => {
        console.log('🔌 WebSocket closed');
        this.connectionStatus.next(false);
        this.handleReconnect();
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.connectionStatus.next(false);
      this.handleReconnect();
    }
  }

decodeZerodhaTick(buffer: ArrayBuffer) {
    if(!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
        return null;
    }
  const data = new DataView(buffer);
  let offset = 0;
  const ticks = [];

  const TICK_SIZE = 44; // 44 bytes per tick

  while (offset + TICK_SIZE <= data.byteLength) {
    const tick = {
      instrumentToken: data.getInt32(offset + 4, false),
      currentPrice: data.getInt32(offset + 8, false) / 100,
      averageTradedPrice: data.getInt32(offset + 16, false) / 100,
      volume: data.getInt32(offset + 20, false),
      totalBuyQuantity: data.getInt32(offset + 24, false),
      totalSellQuantity: data.getInt32(offset + 28, false),
      openPrice: data.getInt32(offset + 32, false) / 100,
      highPrice: data.getInt32(offset + 36, false) / 100,
      lowPrice: data.getInt32(offset + 40, false) / 100,
      closePrice: data.getInt32(offset + 44, false) / 100
    };

    ticks.push(tick);
    offset += TICK_SIZE;
  }

  return ticks;
}

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connectionStatus.next(false);
      console.log('WebSocket disconnected');
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  updateSubscription(instrumentTokens: number[]): void {
    if (!this.isConnected()) {
      this.connect(instrumentTokens);
      return;
    }

    // Unsubscribe from all instruments first
    if (this.instrumentTokens.length > 0) {
      const unsubscribeMsg = { a: 'unsubscribe', v: [...this.instrumentTokens] };
      this.socket?.send(JSON.stringify(unsubscribeMsg));
    }

    // Update and subscribe to new instruments
    this.instrumentTokens = [...instrumentTokens];
    this.subscribeToInstruments(this.instrumentTokens);
  }
}
