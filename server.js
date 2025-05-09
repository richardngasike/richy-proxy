const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const dotenv = require('dotenv');
const basicAuth = require('express-basic-auth');
const http = require('http');
const net = require('net');

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
  res.send('Proxy server is running. Kudos richyICT. Use /health to check status.');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Proxy server is healthy');
});

// Proxy configuration for HTTP requests
const proxyOptions = {
  target: 'http://', // We'll dynamically set the target based on the request
  changeOrigin: true,
  logLevel: 'debug',
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send(`Proxy error: ${err.message}`);
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Forwarding request: ${req.method} ${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Proxy response: ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
  },
};

// Handle all requests (except /health and /) as proxy requests
app.use((req, res, next) => {
  // Skip /health and / routes
  if (req.path === '/' || req.path === '/health') {
    return next();
  }

  // Extract the target URL from the request
  let targetUrl;
  if (req.headers.host && req.url) {
    // When FoxyProxy sends a request, the URL might be absolute (e.g., https://www.hulu.com/)
    // We need to extract the target from the request
    const url = new URL(req.url, `http://${req.headers.host}`);
    targetUrl = url.origin; // e.g., https://www.hulu.com
  } else {
    // Fallback to a default target if TARGET_URL is set
    targetUrl = process.env.TARGET_URL || 'https://www.google.com';
  }

  try {
    new URL(targetUrl);
  } catch (err) {
    console.error('Invalid target URL:', targetUrl);
    return res.status(400).send('Invalid target URL');
  }

  // Update proxy options with the dynamic target
  proxyOptions.target = targetUrl;

  // Apply the proxy middleware for this request
  createProxyMiddleware(proxyOptions)(req, res, next);
});

// Handle CONNECT method for HTTPS tunneling
app.use((req, res, next) => {
  if (req.method === 'CONNECT') {
    const [host, port] = req.url.split(':');
    const targetPort = port || 443;

    // Create a socket connection to the target
    const socket = net.connect(targetPort, host, () => {
      res.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.pipe(res);
      res.pipe(socket);
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err);
      res.status(500).send(`Socket error: ${err.message}`);
    });

    return;
  }
  next();
});

// Start server
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
