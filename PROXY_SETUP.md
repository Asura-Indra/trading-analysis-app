# Proxy Server Setup

This project includes a proxy server to handle Zerodha API requests and avoid CORS issues.

## How It Works

The proxy server:
- Runs on `http://localhost:3001`
- Receives requests from the Angular app
- Forwards them to Zerodha API with proper authentication headers
- Returns the response to the Angular app

## Starting the Proxy Server

Run the proxy server in a separate terminal:

```bash
npm run proxy
```

Or directly:

```bash
node proxy-server.js
```

You should see:
```
🚀 Proxy server running on http://localhost:3001
📡 Proxying requests to Zerodha API
🔗 Health check: http://localhost:3001/health
```

## API Endpoints

### Historical Data
```
GET /api/historical/:instrumentToken/:interval?from=YYYY-MM-DD&to=YYYY-MM-DD&oi=1
```

**Example:**
```
GET http://localhost:3001/api/historical/260105/minute?from=2024-01-01&to=2024-01-31&oi=1
```

### Health Check
```
GET http://localhost:3001/health
```

## Configuration

The proxy server credentials are configured in `proxy-server.js`:
- `USER_ID`: Your Zerodha user ID
- `ENCTOKEN`: Your Zerodha encryption token

**Important:** Update these values in `proxy-server.js` if your credentials change.

## Running Both Servers

You need to run both the proxy server and the Angular app:

**Terminal 1 - Proxy Server:**
```bash
npm run proxy
```

**Terminal 2 - Angular App:**
```bash
npm start
```

## Troubleshooting

1. **Port already in use**: If port 3001 is already in use, change it in `proxy-server.js` and update `PROXY_BASE_URL` in `historical-data.service.ts`

2. **CORS errors**: Make sure the proxy server is running before starting the Angular app

3. **Authentication errors**: Verify your `ENCTOKEN` is valid and not expired

4. **Connection refused**: Ensure the proxy server is running on the correct port

