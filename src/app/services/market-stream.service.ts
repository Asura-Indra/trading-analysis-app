import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MarketStreamService {
  private socket!: WebSocket;
  messageData = new BehaviorSubject<any>(null);
  connect(instrumentTokens: number[]) {
    const API_KEY = 'kitefront';
    const USER_ID = 'JV1693';
    const ENCTOKEN = '1Sdzn2Xy6mx4wbK4WCewP4EConzlDX%2BuYLlp7y8t2sAmHmb6RmOCyc7HX%2Bw1kgaR6Zguxh5c%2BqlB8IRUnFvnIh2g1%2B1aJ5fhuNm0cRI3EELox%2FccjwXp8w%3D%3D';
    const url = `wss://ws.zerodha.com/?api_key=${API_KEY}&user_id=${USER_ID}&enctoken=${ENCTOKEN}&uid=${Date.now()}&user-agent=kite3-web&version=3.0.0`;

    this.socket = new WebSocket(url);

    this.socket.binaryType = 'arraybuffer'; // important for binary data

    this.socket.onopen = () => {
      console.log('✅ Connected to Zerodha WebSocket');
      const msg = { a: 'subscribe', v: [...instrumentTokens] }; // NIFTY 50
      this.socket.send(JSON.stringify(msg));
      console.log('📡 Subscribed to', msg.v);
    };

    this.socket.onmessage = (event) => {
      const packets = this.decodeZerodhaTick(event.data);
      if (packets?.length) {
        this.messageData.next(packets);
      }
    };

    this.socket.onerror = (err) => console.error('❌ WebSocket error:', err);
    this.socket.onclose = () => console.log('🔌 WebSocket closed');
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

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }
}
