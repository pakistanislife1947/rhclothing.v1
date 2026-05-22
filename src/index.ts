import { IncomingMessage, ServerResponse } from 'http';
import { fetchActiveOrders, transitionOrderStatus, processRTO, cancelOrder } from './pipeline';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS Headers set karna taake koi bhi frontend isse access kar sake
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // 1. Fetch Active Orders Endpoint (GET /api/orders)
    if (req.method === 'GET' && (pathname === '/api/orders' || pathname === '/')) {
      const result = await fetchActiveOrders();
      res.statusCode = result.error ? 400 : 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }

    // Body parsing logic for POST requests
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const params = JSON.parse(body || '{}');

      // 2. Transition Status Endpoint (POST /api/transition)
      if (pathname === '/api/transition') {
        const { orderId, currentStatus, targetStatus } = params;
        const result = await transitionOrderStatus(orderId, currentStatus, targetStatus);
        res.statusCode = result.error ? 400 : 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
        return;
      }

      // 3. Process RTO Endpoint (POST /api/rto)
      if (pathname === '/api/rto') {
        const { orderId } = params;
        const result = await processRTO(orderId);
        res.statusCode = result.error ? 400 : 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
        return;
      }

      // 4. Cancel Order Endpoint (POST /api/cancel)
      if (pathname === '/api/cancel') {
        const { orderId } = params;
        const result = await cancelOrder(orderId);
        res.statusCode = result.error ? 400 : 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
        return;
      }
    }

    // Route Not Found
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Route not found' }));

  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
  }
}
