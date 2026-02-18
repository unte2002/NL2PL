import { ProjectSpec, FunctionSpec, FunctionChange, ChangeType } from './types.js';

/**
 * Compare two ProjectSpec snapshots and return a list of changed functions
 * with their change type (interface vs behavior).
 *
 * - interface change: 입력 or 출력 changed → strong warning
 * - behavior change: 동작 changed (but 입력/출력 unchanged) → weak warning
 * - none: no meaningful change
 */
export function diffSpecs(
  oldSpec: ProjectSpec,
  newSpec: ProjectSpec,
): FunctionChange[] {
  const oldFunctions = collectFunctions(oldSpec);
  const newFunctions = collectFunctions(newSpec);
  const changes: FunctionChange[] = [];

  for (const [id, newFn] of newFunctions) {
    const oldFn = oldFunctions.get(id);
    if (!oldFn) {
      // New function — not a "change" for dependency warning purposes
      continue;
    }

    const changeType = classifyChange(oldFn, newFn);
    if (changeType !== 'none') {
      changes.push({
        functionId: id,
        functionName: newFn.name,
        changeType,
      });
    }
  }

  return changes;
}

function classifyChange(oldFn: FunctionSpec, newFn: FunctionSpec): ChangeType {
  const inputsChanged = normalize(oldFn.inputs) !== normalize(newFn.inputs);
  const outputsChanged = normalize(oldFn.outputs) !== normalize(newFn.outputs);
  const behaviorChanged = normalize(oldFn.behavior) !== normalize(newFn.behavior);

  if (inputsChanged || outputsChanged) return 'interface';
  if (behaviorChanged) return 'behavior';
  return 'none';
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function collectFunctions(spec: ProjectSpec): Map<string, FunctionSpec> {
  const map = new Map<string, FunctionSpec>();
  for (const mod of spec.modules) {
    for (const fn of mod.functions) {
      map.set(fn.id, fn);
    }
  }
  return map;
}
