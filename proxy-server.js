const express = require('express');
const cors = require('cors');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Zerodha API credentials
const USER_ID = 'WH0844';
const ENCTOKEN = '8771I+VoIO558jUFi4MBaSztToNz5Loyx+GWLcx1GD8UwmaTiSWiQuz6+sEo8lnM/YO350YmcmvK4NeiPjmGPQbpdsRXP3orBKmg1W6T/OS3DxO+PZ7o6A==';
const ZERODHA_BASE_URL = 'kite.zerodha.com';

/**
 * Proxy endpoint for historical data
 * GET /api/historical/:instrumentToken/:interval
 * Query params: from, to, oi (optional)
 */
app.get('/api/historical/:instrumentToken/:interval', (req, res) => {
  const { instrumentToken, interval } = req.params;
  const { from, to, oi = '1' } = req.query;

  if (!from || !to) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Missing required query parameters: from and to' 
    });
  }

  // Build the Zerodha API URL with proper encoding
  const url = new URL(`https://${ZERODHA_BASE_URL}/oms/instruments/historical/${instrumentToken}/${interval}`);
  url.searchParams.set('user_id', USER_ID);
  url.searchParams.set('oi', oi);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const path = url.pathname + url.search;

  // Set up request options
  const options = {
    hostname: ZERODHA_BASE_URL,
    port: 443,
    path: path,
    method: 'GET',
    headers: {
      'Authorization': `enctoken ${ENCTOKEN}`,
      'X-Kite-Version': '3',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    }
  };

  // Make request to Zerodha API
  const proxyReq = https.request(options, (proxyRes) => {
    let data = '';

    // Collect response data
    proxyRes.on('data', (chunk) => {
      data += chunk;
    });

    // Forward response to client
    proxyRes.on('end', () => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Forward status code and headers
      res.status(proxyRes.statusCode);

      // Try to parse JSON, if it fails, send raw data
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        res.send(data);
      }
    });
  });

  // Handle errors
  proxyReq.on('error', (error) => {
    console.error('Proxy request error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Proxy request failed', 
      error: error.message 
    });
  });

  // End the request
  proxyReq.end();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Proxy server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`📡 Proxying requests to Zerodha API`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

