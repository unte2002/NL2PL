import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import { watch } from 'chokidar';

// Load .env from project root
const envPath = path.resolve(import.meta.dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
  console.log('.env loaded from', envPath);
}
import {
  parseSpec,
  resetIdCounter,
  buildReverseDependencyMap,
  diffSpecs,
  getAffectedFunctions,
  type ProjectSpec,
  type ServerMessage,
  type ClientMessage,
  type ReverseDependencyMap,
} from '@nl2pl/shared';
import { buildPrompt } from './prompt-builder.js';
import { generateCode } from './llm.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const PROJECT_ROOT = process.env.NL2PL_CWD || path.resolve(import.meta.dirname, '../../..');
const CWD = PROJECT_ROOT;
const SPEC_FILE = path.join(CWD, 'spec.nl2pl');

// --- State ---
let currentSpec: ProjectSpec | null = null;
let currentRaw = '';
let reverseDeps: ReverseDependencyMap = {};
let ignoreNextFileChange = false;

// --- Express ---
const app = express();
app.use(express.json());

// Serve built client (production)
const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// --- HTTP API ---

app.get('/api/spec', (_req, res) => {
  if (!currentSpec) {
    res.status(404).json({ error: 'No spec.nl2pl found' });
    return;
  }
  res.json({ spec: currentSpec, raw: currentRaw });
});

app.post('/api/save-file', (req, res) => {
  const { filePath, code } = req.body as { filePath: string; code: string };
  const absPath = path.resolve(CWD, filePath);

  if (!absPath.startsWith(CWD)) {
    res.status(400).json({ error: 'Path must be within project directory' });
    return;
  }

  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, code, 'utf-8');
  res.json({ ok: true, path: absPath });
});

// --- HTTP Server + WebSocket ---
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg: ServerMessage, exclude?: WebSocket): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== exclude) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  // Send current spec on connect
  if (currentSpec) {
    const msg: ServerMessage = { type: 'spec_updated', spec: currentSpec, raw: currentRaw };
    ws.send(JSON.stringify(msg));
  }

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'generate':
        await handleGenerate(ws, msg.functionId);
        break;

      case 'update_spec':
        handleUpdateSpec(msg.raw, ws);
        break;

      case 'save_file':
        handleSaveFile(msg.functionId, msg.path, msg.code);
        break;

      case 'dismiss_warning':
        break;
    }
  });
});

function handleUpdateSpec(raw: string, sender: WebSocket): void {
  const oldSpec = currentSpec;
  currentRaw = raw;

  resetIdCounter();
  const newSpec = parseSpec(raw);
  currentSpec = newSpec;
  reverseDeps = buildReverseDependencyMap(newSpec);

  // Write to file (suppress file watcher re-trigger)
  ignoreNextFileChange = true;
  fs.writeFileSync(SPEC_FILE, raw, 'utf-8');

  // Broadcast to other clients (not the sender, who already has the text)
  broadcast({ type: 'spec_updated', spec: newSpec, raw }, sender);

  // Dependency warnings to all clients including sender
  if (oldSpec) {
    const changes = diffSpecs(oldSpec, newSpec);
    for (const change of changes) {
      if (change.changeType === 'none') continue;
      const affected = getAffectedFunctions(reverseDeps, change.functionId);
      if (affected.length > 0) {
        broadcast({
          type: 'dependency_warning',
          affected,
          changedFunction: change.functionName,
          changeType: change.changeType,
        });
      }
    }
  }
}

async function handleGenerate(ws: WebSocket, functionId: string): Promise<void> {
  console.log(`[generate] requested functionId=${functionId}`);

  if (!currentSpec) {
    console.log('[generate] no currentSpec, aborting');
    ws.send(JSON.stringify({ type: 'generation_done', functionId } satisfies ServerMessage));
    return;
  }

  let targetModule: string | null = null;
  let targetFn: ReturnType<typeof findFunctionById> = null;

  for (const mod of currentSpec.modules) {
    for (const fn of mod.functions) {
      if (fn.id === functionId) {
        targetModule = mod.name;
        targetFn = fn;
        break;
      }
    }
    if (targetFn) break;
  }

  if (!targetFn || !targetModule) {
    console.log(`[generate] function not found for id=${functionId}`);
    console.log(`[generate] available ids: ${currentSpec.modules.flatMap(m => m.functions.map(f => f.id)).join(', ')}`);
    // Always send generation_done so the client doesn't get stuck
    ws.send(JSON.stringify({ type: 'generation_done', functionId } satisfies ServerMessage));
    return;
  }

  console.log(`[generate] found function: ${targetFn.name} in module: ${targetModule}`);
  const prompt = buildPrompt(currentSpec, targetModule, targetFn);

  try {
    for await (const chunk of generateCode(prompt)) {
      const msg: ServerMessage = { type: 'generation_chunk', functionId, chunk };
      ws.send(JSON.stringify(msg));
    }
  } catch (err) {
    console.error('[generate] LLM error:', err instanceof Error ? err.message : err);
    const errorChunk: ServerMessage = {
      type: 'generation_chunk',
      functionId,
      chunk: `\n// Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
    ws.send(JSON.stringify(errorChunk));
  }

  const done: ServerMessage = { type: 'generation_done', functionId };
  ws.send(JSON.stringify(done));
  console.log(`[generate] done for ${functionId}`);
}

function handleSaveFile(functionId: string, filePath: string, code: string): void {
  const absPath = path.resolve(CWD, filePath);
  if (!absPath.startsWith(CWD)) return;

  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, code, 'utf-8');
}

function findFunctionById(spec: ProjectSpec, id: string) {
  for (const mod of spec.modules) {
    for (const fn of mod.functions) {
      if (fn.id === id) return fn;
    }
  }
  return null;
}

// --- File Watcher ---

function loadSpec(): void {
  if (ignoreNextFileChange) {
    ignoreNextFileChange = false;
    return;
  }

  if (!fs.existsSync(SPEC_FILE)) {
    currentSpec = null;
    currentRaw = '';
    return;
  }

  const content = fs.readFileSync(SPEC_FILE, 'utf-8');
  const oldSpec = currentSpec;
  currentRaw = content;

  resetIdCounter();
  const newSpec = parseSpec(content);
  currentSpec = newSpec;
  reverseDeps = buildReverseDependencyMap(newSpec);

  broadcast({ type: 'spec_updated', spec: newSpec, raw: content });

  if (oldSpec) {
    const changes = diffSpecs(oldSpec, newSpec);
    for (const change of changes) {
      if (change.changeType === 'none') continue;
      const affected = getAffectedFunctions(reverseDeps, change.functionId);
      if (affected.length > 0) {
        broadcast({
          type: 'dependency_warning',
          affected,
          changedFunction: change.functionName,
          changeType: change.changeType,
        });
      }
    }
  }
}

// Initial load
loadSpec();

// Watch for changes
const watcher = watch(SPEC_FILE, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 300 },
});
watcher.on('change', () => loadSpec());
watcher.on('add', () => loadSpec());

// --- Start ---
server.listen(PORT, () => {
  console.log(`NL2PL server running at http://localhost:${PORT}`);
  console.log(`Watching: ${SPEC_FILE}`);
});
