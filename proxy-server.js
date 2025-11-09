const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');



const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Zerodha API configuration
const ZERODHA_BASE_URL = 'kite.zerodha.com';

// Helper function to make authenticated requests to Zerodha API
async function makeZerodhaRequest(url, options = {}) {
  try {
    const defaultHeaders = {
      'accept': 'application/json, text/plain, */*',
      'x-kite-version': '3.0.0',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    // If we have an enctoken in headers, use it for authorization
    if (options.headers?.authorization) {
      const enctoken = options.headers.authorization.replace('enctoken ', '');
      defaultHeaders['authorization'] = `enctoken ${enctoken}`;
      delete options.headers.authorization; // Remove to avoid duplicate
    }

    const response = await axios({
      method: options.method || 'GET',
      url: `https://${ZERODHA_BASE_URL}${url}`,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      },
      data: options.data,
      withCredentials: true,
      responseType: 'json',
      // Forward cookies if present
      ...(options.cookies ? { headers: { ...defaultHeaders, 'Cookie': Object.entries(options.cookies).map(([k, v]) => `${k}=${v}`).join('; ') } } : {})
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    console.error('Zerodha API error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    throw error;
  }
}

// Login endpoint
app.post('/api/proxy/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    
    const response = await makeZerodhaRequest('/api/login', {
      method: 'POST',
      data: new URLSearchParams({
        user_id: userId,
        password: password,
        type: 'user_id'
      }).toString()
    });

    // Extract cookies from response
    const cookies = response.headers['set-cookie'] || [];
    const cookieData = parseCookies(cookies);
    

    // Set cookies in the response
    Object.entries(cookieData).forEach(([key, value]) => {
      res.cookie(key, value, {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      });
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Login failed',
      error: error.message
    });
  }
});

// 2FA verification endpoint
app.post('/api/proxy/verify-2fa', async (req, res) => {
  try {
    const { userId, requestId, twoFACode } = req.body;
    
    const response = await makeZerodhaRequest('/api/twofa', {
      method: 'POST',
      data: new URLSearchParams({
        user_id: userId,
        request_id: requestId,
        twofa_value: twoFACode,
        twofa_type: 'app_code',
        skip_session: ''
      }).toString()
    });

    // Extract cookies from response
    const cookies = response.headers['set-cookie'] || [];
    const cookieData = parseCookies(cookies);
    

    // Set cookies in the response
    Object.entries(cookieData).forEach(([key, value]) => {
      res.cookie(key, value, {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      });
    });

    res.status(response.status).json({
      ...response.data,
      cookies: cookieData
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({
      status: 'error',
      message: '2FA verification failed',
      error: error.message
    });
  }
});

// Historical data endpoint
app.get('/api/historical/:instrumentToken/:interval', async (req, res) => {
  try {
    const { instrumentToken, interval } = req.params;
    const { from, to } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({ error: 'Missing required query parameters: from and to dates are required' });
    }

    const response = await makeZerodhaRequest(`/oms/instruments/historical/${instrumentToken}/${interval}?from=${from}&to=${to}`, {
      headers: {
        'authorization': req.headers.authorization
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Historical data error:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to fetch historical data',
      details: error.response?.data
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  // Clear any session data if needed
  res.json({ status: 'success', message: 'Logged out successfully' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Proxy server error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
  });
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  } else {
    console.error('Server error:', error);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
// Helper function to parse cookies from response headers
function parseCookies(cookieHeaders) {
  const cookieData = {};
  const cookies = Array.isArray(cookieHeaders) ? cookieHeaders : [cookieHeaders || ''];
  
  cookies.forEach(cookie => {
    if (!cookie) return;
    // Get the first part before any semicolon (removing attributes like Path, Domain, etc.)
    const keyValue = cookie.split(';')[0];
    // Find the first equals sign to properly split key and value
    const separatorIndex = keyValue.indexOf('=');
    if (separatorIndex !== -1) {
      const key = keyValue.substring(0, separatorIndex).trim();
      const value = keyValue.substring(separatorIndex + 1).trim();
      if (key) {
        // Preserve the entire value including any equals signs
        cookieData[key] = value;
      }
    }
  });
  
  return cookieData;
}