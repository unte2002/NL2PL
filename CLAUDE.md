# NL2PL — Project Guide

> Developer draws the tree, LLM fills the leaves.

## What is this project?

NL2PL (Natural Language to Programming Language) is a tool that lets developers write natural language specs (`spec.nl2pl`) and generates code from them via LLM. The developer controls structure; the LLM handles implementation details.

MVP deliverable: `npx nl2pl` launches a local web server with a spec editor + code generation UI.

## Project Structure

```
nl2pl/
├── packages/
│   ├── shared/     ← TypeScript types shared between server & client
│   ├── server/     ← Node.js (Express + WebSocket)
│   └── client/     ← React (Vite)
├── package.json    ← npm workspaces root
└── 기획서.md       ← Full specification (Korean) — the source of truth for design decisions
```

## Tech Stack

- **Language**: TypeScript (strict mode) throughout all packages
- **Server**: Express + ws (WebSocket) + chokidar (file watcher)
- **Client**: React + Vite + Zustand (state) + Tailwind CSS (styling) + Monaco Editor (code panel)
- **LLM**: OpenAI SDK (single model, streaming)
- **Monorepo**: npm workspaces

## Key Concepts

### spec.nl2pl Format

The spec file is the **source of truth**. It uses a minimal structured format:

- Fixed keywords: `입력:`, `출력:`, `동작:`, `function`, `module`
- `[함수명]` — inline dependency reference (only recognized inside `동작:` blocks)
- `[모듈명.함수명]` — cross-module reference
- Free-form natural language inside `동작:` blocks (Korean/English mixed OK)

### Core Data Types (packages/shared)

- `ProjectSpec` → `ModuleSpec[]` → `FunctionSpec[]`
- `NodeStatus`: `'empty'` | `'generated'` | `'stale'`
- `ServerMessage` / `ClientMessage` — WebSocket protocol types

### Dependency Tracking

- `[함수명]` patterns in `동작:` blocks form the dependency graph
- Interface changes (`입력:`/`출력:`) → strong warning (regeneration recommended)
- Behavior changes (`동작:` only) → weak warning or record-only
- Warnings appear in a side panel, never as inline popups

### Spec-Code Relationship

- Spec is source of truth; code is derived
- Code modifications do NOT auto-update spec (MVP)
- Reverse sync (code → spec) is deferred to post-MVP

## Architecture Principles

1. **Parser is the foundation** — everything (dependency graph, LLM prompts, UI) depends on a stable parser. Stabilize with unit tests first.
2. **Pure functions at the core** — parser, dependency graph builder, and diff detector are pure functions. Keep them free of side effects for easy testing.
3. **Shared types are the contract** — `packages/shared` types define the interface between server and client. Change types first, then update consumers.
4. **Warnings, not auto-actions** — the tool highlights inconsistencies but never auto-overwrites. The developer decides when to resolve.

## Development Conventions

### Code Style

- TypeScript strict mode in all packages
- Use named exports (not default exports)
- Prefer `interface` over `type` for object shapes
- Use descriptive variable names; comments only where logic isn't self-evident

### Testing

- Unit tests for parser, dependency graph, and diff detector are critical
- Test cases must cover: dependencies present/absent, cross-module refs, nonexistent function refs, missing `동작:` blocks, mixed indentation
- Use Vitest as the test runner

### File Naming

- `kebab-case` for file names (e.g., `spec-parser.ts`, `dependency-graph.ts`)
- One module per file; co-locate tests as `*.test.ts`

### Commit Messages

- Write in English
- Format: `<type>: <short description>` (e.g., `feat: add spec parser`, `fix: handle empty behavior block`)

## MVP Scope

### Included
- Spec authoring (function-level: `입력/출력/동작` blocks)
- Spec → code generation (project header + dependency specs as LLM context)
- `[함수명]` inline reference parsing & dependency graph
- Dependency change warnings (interface changes only)

### Excluded (post-MVP)
- Code → spec reverse sync
- Spec-code mismatch auto-detection & highlight
- Unreflected modifications badge
- Collapsed summary LLM regeneration (↺ icon)
- Dependency graph visualization view

## Common Tasks

### Running the project (after implementation)
```bash
npm install          # from root
npm run dev          # dev mode with hot reload
npx nl2pl           # production: serves built client from Express
```

### Running tests
```bash
npm test                              # all packages
npm test --workspace=packages/shared  # shared only
```

## Important Files

| File | Purpose |
|------|---------|
| `기획서.md` | Full project specification (Korean). Consult for any design questions. |
| `packages/shared/src/types.ts` | Core type definitions — the contract between all packages |
| `packages/shared/src/spec-parser.ts` | spec.nl2pl parser |
| `packages/shared/src/dependency-graph.ts` | Dependency graph builder |
| `packages/shared/src/spec-diff.ts` | Diff detector (interface vs behavior changes) |
| `packages/server/src/index.ts` | Express + WebSocket server entry point |
| `packages/client/src/App.tsx` | React app entry point |
