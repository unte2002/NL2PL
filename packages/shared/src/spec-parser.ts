import { ProjectSpec, ModuleSpec, FunctionSpec } from './types.js';

/**
 * Parse a spec.nl2pl string into a ProjectSpec object.
 *
 * Grammar summary:
 *   - Project header fields: `언어:`, `프레임워크:`, `DB:`, `컨벤션:`, `목적:`,
 *     `환경:`, `전역 상태:`, `외부 의존성:`
 *   - `[모듈]` or `module` starts a module block
 *   - `function` starts a function block inside a module
 *   - `입력:`, `출력:`, `동작:` are function-level fields
 *   - `[함수명]` inside 동작 block = dependency reference
 */
export function parseSpec(raw: string): ProjectSpec {
  const lines = raw.split(/\r?\n/);
  const spec: ProjectSpec = {
    language: '',
    framework: '',
    conventions: '',
    purpose: '',
    modules: [],
  };

  let currentModule: ModuleSpec | null = null;
  let currentFunction: FunctionSpec | null = null;
  let currentField: 'inputs' | 'outputs' | 'behavior' | null = null;
  let fieldIndent = 0;

  const flushFunction = () => {
    if (currentFunction && currentModule) {
      currentFunction.inputs = currentFunction.inputs.trim();
      currentFunction.outputs = currentFunction.outputs.trim();
      currentFunction.behavior = currentFunction.behavior.trim();
      currentFunction.dependencies = extractDependencies(currentFunction.behavior);
      currentModule.functions.push(currentFunction);
    }
    currentFunction = null;
    currentField = null;
  };

  const flushModule = () => {
    flushFunction();
    if (currentModule) {
      spec.modules.push(currentModule);
    }
    currentModule = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      // Blank or comment lines inside a behavior block are preserved
      if (currentField === 'behavior' && currentFunction && trimmed === '') {
        currentFunction.behavior += '\n';
      }
      continue;
    }

    // --- Project header fields ---
    const headerMatch = matchHeaderField(trimmed);
    if (headerMatch && !currentModule) {
      applyHeaderField(spec, headerMatch.key, headerMatch.value);
      continue;
    }

    // --- Module start ---
    const moduleMatch = trimmed.match(/^\[모듈\]\s*(.+)$/) ?? trimmed.match(/^module\s+(.+)$/i);
    if (moduleMatch) {
      flushModule();
      const nameAndDesc = moduleMatch[1].trim();
      const [name, ...descParts] = nameAndDesc.split(/\s*-\s*/);
      currentModule = {
        id: generateId(name.trim()),
        name: name.trim(),
        description: descParts.join(' - ').trim(),
        functions: [],
      };
      currentField = null;
      continue;
    }

    // --- Function start ---
    const funcMatch = trimmed.match(/^\[?function\]?\s+(.+)$/i);
    if (funcMatch && currentModule) {
      flushFunction();
      currentFunction = {
        id: generateId(funcMatch[1].trim()),
        name: funcMatch[1].trim(),
        inputs: '',
        outputs: '',
        behavior: '',
        dependencies: [],
        status: 'empty',
      };
      currentField = null;
      continue;
    }

    // --- Function-level fields ---
    if (currentFunction) {
      const inputMatch = trimmed.match(/^입력:\s*(.*)$/);
      if (inputMatch) {
        currentField = 'inputs';
        fieldIndent = getIndent(line);
        currentFunction.inputs = inputMatch[1];
        continue;
      }

      const outputMatch = trimmed.match(/^출력:\s*(.*)$/);
      if (outputMatch) {
        currentField = 'outputs';
        fieldIndent = getIndent(line);
        currentFunction.outputs = outputMatch[1];
        continue;
      }

      const behaviorMatch = trimmed.match(/^동작:\s*(.*)$/);
      if (behaviorMatch) {
        currentField = 'behavior';
        fieldIndent = getIndent(line);
        currentFunction.behavior = behaviorMatch[1];
        continue;
      }

      // Continuation lines for the current field
      if (currentField && getIndent(line) > fieldIndent) {
        currentFunction[currentField] += '\n' + trimmed;
        continue;
      }

      // If we hit a line at the same or lower indent that isn't a known keyword,
      // close the current field
      if (currentField && getIndent(line) <= fieldIndent) {
        currentField = null;
      }
    }
  }

  // Flush remaining
  flushModule();

  return spec;
}

// --- Helpers ---

function matchHeaderField(line: string): { key: string; value: string } | null {
  const patterns: [RegExp, string][] = [
    [/^언어:\s*(.+)$/, 'language'],
    [/^프레임워크:\s*(.+)$/, 'framework'],
    [/^DB:\s*(.+)$/, 'db'],
    [/^컨벤션:\s*(.+)$/, 'conventions'],
    [/^목적:\s*(.+)$/, 'purpose'],
    [/^환경:\s*(.+)$/, 'environment'],
    [/^전역 상태:\s*(.+)$/, 'globalState'],
    [/^외부 의존성:\s*(.+)$/, 'externalDeps'],
  ];

  for (const [pattern, key] of patterns) {
    const match = line.match(pattern);
    if (match) return { key, value: match[1].trim() };
  }
  return null;
}

function applyHeaderField(spec: ProjectSpec, key: string, value: string): void {
  switch (key) {
    case 'language': spec.language = value; break;
    case 'framework': spec.framework = value; break;
    case 'db': spec.db = value; break;
    case 'conventions': spec.conventions = value; break;
    case 'purpose': spec.purpose = value; break;
    case 'environment': spec.environment = value; break;
    case 'globalState': spec.globalState = value; break;
    case 'externalDeps': spec.externalDeps = value; break;
  }
}

/**
 * Extract `[함수명]` and `[모듈명.함수명]` dependency references from a behavior string.
 * Only references inside 동작 blocks are recognized as dependencies.
 */
export function extractDependencies(behavior: string): string[] {
  const matches = behavior.matchAll(/\[([^\]]+)\]/g);
  const deps: string[] = [];
  for (const match of matches) {
    const ref = match[1].trim();
    if (ref.length > 0) {
      deps.push(ref);
    }
  }
  return [...new Set(deps)];
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

function generateId(name: string): string {
  return `${name}_${++idCounter}`;
}

/**
 * Serialize a ProjectSpec back into spec.nl2pl format.
 */
export function serializeSpec(spec: ProjectSpec): string {
  const lines: string[] = [];

  if (spec.language) lines.push(`언어: ${spec.language}`);
  if (spec.framework) lines.push(`프레임워크: ${spec.framework}`);
  if (spec.db) lines.push(`DB: ${spec.db}`);
  if (spec.conventions) lines.push(`컨벤션: ${spec.conventions}`);
  if (spec.purpose) lines.push(`목적: ${spec.purpose}`);
  if (spec.environment) lines.push(`환경: ${spec.environment}`);
  if (spec.globalState) lines.push(`전역 상태: ${spec.globalState}`);
  if (spec.externalDeps) lines.push(`외부 의존성: ${spec.externalDeps}`);

  for (const mod of spec.modules) {
    lines.push('');
    const moduleHeader = mod.description
      ? `[모듈] ${mod.name} - ${mod.description}`
      : `[모듈] ${mod.name}`;
    lines.push(moduleHeader);

    for (const fn of mod.functions) {
      lines.push(`  function ${fn.name}`);
      if (fn.inputs) lines.push(`    입력: ${fn.inputs}`);
      if (fn.outputs) lines.push(`    출력: ${fn.outputs}`);
      if (fn.behavior) {
        const behaviorLines = fn.behavior.split('\n');
        lines.push(`    동작:`);
        for (const bl of behaviorLines) {
          lines.push(`      ${bl}`);
        }
      }
    }
  }

  return lines.join('\n') + '\n';
}
