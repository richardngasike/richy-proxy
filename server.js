const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const dotenv = require('dotenv');
const basicAuth = require('express-basic-auth');

// Load environment variables
dotenv.config();

const app = express();

// Middleware to log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Optional: Add basic authentication if PROXY_USERNAME and PROXY_PASSWORD are set
if (process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
  app.use(
    basicAuth({
      users: { [process.env.PROXY_USERNAME]: process.env.PROXY_PASSWORD },
      challenge: true,
      unauthorizedResponse: 'Unauthorized: Please provide valid credentials',
    })
  );
  console.log('Basic authentication enabled');
} else {
  console.log('Basic authentication disabled (set PROXY_USERNAME and PROXY_PASSWORD to enable)');
}

// Root route for debugging
app.get('/', (req, res) => {
  res.send('Proxy server is running. Kudos richyICT. Use /health to check status or /proxy to route through the proxy.');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Proxy server is healthy, kudos wizartech');
});

// Validate TARGET_URL
const targetUrl = process.env.TARGET_URL || 'https://www.google.com';
try {
  new URL(targetUrl);
} catch (err) {
  console.error('Invalid TARGET_URL:', targetUrl);
  process.exit(1);
}

// Proxy configuration
const proxyOptions = {
  target: targetUrl,
  changeOrigin: true,
  logLevel: 'debug',
  pathRewrite: { '^/proxy': '' },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send(`Proxy error: ${err.message}`);
  },
  onProxyReq: (proxyReq, req, res) => {
    if (req.method === 'CONNECT') {
      res.writeHead(200, { 'Connection': 'keep-alive' });
      res.end();
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Proxy response: ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
  },
};

// Apply proxy middleware to /proxy route
app.use('/proxy', createProxyMiddleware(proxyOptions));

// Error handling for unmatched routes
app.use((req, res) => {
  res.status(404).send('Not Found: Use /proxy to route through the proxy, or /health to check status.');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});