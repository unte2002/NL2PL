import { ProjectSpec, FunctionSpec, ReverseDependencyMap } from './types.js';

/**
 * Build a reverse dependency map from a ProjectSpec.
 *
 * For each function, look at its dependencies (parsed from [함수명] in 동작 block).
 * Resolve each dependency name to a function id, then record:
 *   reverseDeps[dependencyId] = [...functionsIdsThatDependOnIt]
 *
 * References use either:
 *   - `[함수명]` → same-module lookup first, then global
 *   - `[모듈명.함수명]` → direct cross-module lookup
 */
export function buildReverseDependencyMap(spec: ProjectSpec): ReverseDependencyMap {
  const map: ReverseDependencyMap = {};
  const lookup = buildFunctionLookup(spec);

  for (const mod of spec.modules) {
    for (const fn of mod.functions) {
      for (const dep of fn.dependencies) {
        const resolvedId = resolveDependency(dep, mod.name, lookup);
        if (resolvedId) {
          if (!map[resolvedId]) map[resolvedId] = [];
          if (!map[resolvedId].includes(fn.id)) {
            map[resolvedId].push(fn.id);
          }
        }
      }
    }
  }

  return map;
}

interface FunctionLookupEntry {
  id: string;
  moduleName: string;
  functionName: string;
}

function buildFunctionLookup(spec: ProjectSpec): FunctionLookupEntry[] {
  const entries: FunctionLookupEntry[] = [];
  for (const mod of spec.modules) {
    for (const fn of mod.functions) {
      entries.push({
        id: fn.id,
        moduleName: mod.name,
        functionName: fn.name,
      });
    }
  }
  return entries;
}

/**
 * Resolve a dependency reference to a function id.
 *
 * - `모듈명.함수명` → exact match on module + function name
 * - `함수명` → same module first, then first match globally
 */
function resolveDependency(
  ref: string,
  currentModuleName: string,
  lookup: FunctionLookupEntry[],
): string | null {
  if (ref.includes('.')) {
    const [modName, fnName] = ref.split('.', 2);
    const entry = lookup.find(
      (e) => e.moduleName === modName && e.functionName === fnName,
    );
    return entry?.id ?? null;
  }

  // Same module first
  const sameModule = lookup.find(
    (e) => e.moduleName === currentModuleName && e.functionName === ref,
  );
  if (sameModule) return sameModule.id;

  // Global fallback
  const global = lookup.find((e) => e.functionName === ref);
  return global?.id ?? null;
}

/**
 * Get all function ids that are affected when a given function changes.
 * Returns direct dependents only (not transitive).
 */
export function getAffectedFunctions(
  reverseDeps: ReverseDependencyMap,
  changedFunctionId: string,
): string[] {
  return reverseDeps[changedFunctionId] ?? [];
}
