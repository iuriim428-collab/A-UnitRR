#!/usr/bin/env node
/**
 * local-wb-proxy.mjs — локальный прокси для Wildberries Statistics API
 *
 * Запуск: node local-wb-proxy.mjs
 * Требуется Node.js 18+
 *
 * Держите этот терминал открытым пока работаете с приложением Unit Economics.
 * Запросы к WB будут идти с вашего IP, а не с облачного сервера.
 */

import http from 'http';
import { URL } from 'url';

const PORT = 3001;
const WB_BASE = 'https://statistics-api.wildberries.ru';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'X-WB-Token, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const server = http.createServer(async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (reqUrl.pathname === '/api/wb/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'GET' || reqUrl.pathname !== '/api/wb/report') {
    res.writeHead(404);
    res.end();
    return;
  }

  const token = req.headers['x-wb-token'];
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Заголовок X-WB-Token не указан' }));
    return;
  }

  const dateFrom = reqUrl.searchParams.get('dateFrom');
  const dateTo = reqUrl.searchParams.get('dateTo');
  if (!dateFrom || !dateTo) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Нужны параметры dateFrom и dateTo' }));
    return;
  }

  console.log(`[WB] Fetching report ${dateFrom} → ${dateTo}`);

  try {
    const allRows = [];
    let rrdid = 0;

    while (true) {
      const url =
        `${WB_BASE}/api/v5/supplier/reportDetailByPeriod` +
        `?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100000&rrdid=${rrdid}`;

      const upstream = await fetch(url, {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstream.ok) {
        const body = await upstream.text().catch(() => '');
        console.error(`[WB] Error ${upstream.status}:`, body);
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `WB API ${upstream.status}: ${body}` }));
        return;
      }

      const page = await upstream.json();
      if (!Array.isArray(page) || page.length === 0) break;

      allRows.push(...page);
      console.log(`[WB] Loaded ${allRows.length} rows...`);

      const last = page[page.length - 1];
      rrdid = Number(last?.rrd_id ?? 0);
      if (page.length < 100_000) break;
    }

    console.log(`[WB] Done: ${allRows.length} rows total`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(allRows));
  } catch (err) {
    console.error('[WB] Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Ошибка прокси: ${err.message}` }));
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  WB прокси запущен: http://localhost:${PORT}  ║`);
  console.log('║  Оставьте окно открытым и вернитесь в приложение  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
