import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeRecording } from './src/recordingAnalyzer.js';
import { MIN_ANALYSIS_DURATION_SEC } from './src/config.js';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function resultsFilePath(dataDir) {
  return path.join(dataDir, 'results.json');
}

function loadResults(dataDir) {
  const file = resultsFilePath(dataDir);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return [];
  }
}

function saveResults(dataDir, results) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(resultsFilePath(dataDir), JSON.stringify(results, null, 2));
}

function bufferToFloat32Array(buffer) {
  const floatCount = Math.floor(buffer.length / 4);
  const aligned = new ArrayBuffer(floatCount * 4);
  new Uint8Array(aligned).set(buffer.subarray(0, floatCount * 4));
  return new Float32Array(aligned);
}

function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(ROOT_DIR, relativePath));

  if (!resolved.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
}

async function handleAnalyze(req, res, dataDir) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const sampleRate = Number(searchParams.get('sampleRate'));
  const duration = Number(searchParams.get('duration'));
  const source = searchParams.get('source') === 'upload' ? 'upload' : 'live';

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return sendJson(res, 400, { error: 'invalid_sample_rate' });
  }
  if (!Number.isFinite(duration) || duration < MIN_ANALYSIS_DURATION_SEC) {
    return sendJson(res, 422, { error: 'too_short', minDurationSec: MIN_ANALYSIS_DURATION_SEC });
  }

  const body = await readRawBody(req);
  const samples = bufferToFloat32Array(body);

  let analysis;
  try {
    analysis = analyzeRecording(samples, sampleRate);
  } catch (err) {
    return sendJson(res, 422, {
      error: 'too_short',
      minDurationSec: MIN_ANALYSIS_DURATION_SEC,
      detail: err.message,
    });
  }

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    ...analysis,
    report: null,
  };

  const results = loadResults(dataDir);
  results.push(record);
  saveResults(dataDir, results);

  sendJson(res, 200, record);
}

function handleListResults(req, res, dataDir) {
  const results = loadResults(dataDir).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  sendJson(res, 200, results);
}

async function handleAddReport(req, res, dataDir, id) {
  const body = await readRawBody(req);
  let payload = {};
  try {
    payload = body.length ? JSON.parse(body.toString('utf-8')) : {};
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }

  const results = loadResults(dataDir);
  const index = results.findIndex((r) => r.id === id);
  if (index === -1) return sendJson(res, 404, { error: 'not_found' });

  results[index].report = {
    location: payload.location ?? null,
    occurredAt: payload.occurredAt ?? null,
    description: payload.description ?? null,
    contact: payload.contact ?? null,
    submittedAt: new Date().toISOString(),
  };
  saveResults(dataDir, results);
  sendJson(res, 200, results[index]);
}

export function createServer({ dataDir = path.join(ROOT_DIR, 'data') } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      const reportMatch = pathname.match(/^\/api\/results\/([^/]+)\/report$/);

      if (req.method === 'POST' && pathname === '/api/analyze') {
        return await handleAnalyze(req, res, dataDir);
      }
      if (req.method === 'GET' && pathname === '/api/results') {
        return handleListResults(req, res, dataDir);
      }
      if (req.method === 'POST' && reportMatch) {
        return await handleAddReport(req, res, dataDir, reportMatch[1]);
      }
      if (req.method === 'GET') {
        return serveStatic(req, res);
      }
      sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      sendJson(res, 500, { error: 'internal_error', detail: err.message });
    }
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`소음 방해지수 서버 실행 중: http://localhost:${port}`);
  });
}
