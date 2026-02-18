import { ProjectSpec, FunctionSpec, ModuleSpec } from '@nl2pl/shared';

/**
 * Build the LLM prompt for generating code for a specific function.
 *
 * Context included:
 *   1. Project header (always)
 *   2. Dependency function specs (resolved from [함수명] references)
 *   3. The target function spec itself
 */
export function buildPrompt(
  spec: ProjectSpec,
  targetModuleName: string,
  targetFunction: FunctionSpec,
): string {
  const sections: string[] = [];

  // 1. Project header
  sections.push(buildProjectHeader(spec));

  // 2. Dependency specs
  const depSpecs = resolveDependencySpecs(spec, targetModuleName, targetFunction);
  if (depSpecs.length > 0) {
    sections.push(buildDependencySection(depSpecs));
  }

  // 3. Target function spec
  sections.push(buildTargetSection(targetModuleName, targetFunction));

  // 4. Instruction
  sections.push(buildInstruction(spec));

  return sections.join('\n\n');
}

function buildProjectHeader(spec: ProjectSpec): string {
  const lines = ['[프로젝트 정보]'];
  if (spec.language) lines.push(`언어: ${spec.language}`);
  if (spec.framework) lines.push(`프레임워크: ${spec.framework}`);
  if (spec.db) lines.push(`DB: ${spec.db}`);
  if (spec.conventions) lines.push(`컨벤션: ${spec.conventions}`);
  if (spec.purpose) lines.push(`목적: ${spec.purpose}`);
  if (spec.environment) lines.push(`환경: ${spec.environment}`);
  if (spec.globalState) lines.push(`전역 상태: ${spec.globalState}`);
  if (spec.externalDeps) lines.push(`외부 의존성: ${spec.externalDeps}`);
  return lines.join('\n');
}

interface ResolvedDep {
  moduleName: string;
  fn: FunctionSpec;
}

function resolveDependencySpecs(
  spec: ProjectSpec,
  currentModuleName: string,
  targetFunction: FunctionSpec,
): ResolvedDep[] {
  const resolved: ResolvedDep[] = [];

  for (const depRef of targetFunction.dependencies) {
    const found = findFunction(spec, depRef, currentModuleName);
    if (found) {
      resolved.push(found);
    }
  }

  return resolved;
}

function findFunction(
  spec: ProjectSpec,
  ref: string,
  currentModuleName: string,
): ResolvedDep | null {
  if (ref.includes('.')) {
    const [modName, fnName] = ref.split('.', 2);
    for (const mod of spec.modules) {
      if (mod.name === modName) {
        const fn = mod.functions.find((f) => f.name === fnName);
        if (fn) return { moduleName: mod.name, fn };
      }
    }
    return null;
  }

  // Same module first
  for (const mod of spec.modules) {
    if (mod.name === currentModuleName) {
      const fn = mod.functions.find((f) => f.name === ref);
      if (fn) return { moduleName: mod.name, fn };
    }
  }

  // Global fallback
  for (const mod of spec.modules) {
    const fn = mod.functions.find((f) => f.name === ref);
    if (fn) return { moduleName: mod.name, fn };
  }

  return null;
}

function buildDependencySection(deps: ResolvedDep[]): string {
  const lines = ['[의존 함수 명세]'];
  for (const dep of deps) {
    lines.push('');
    lines.push(`function ${dep.fn.name} (모듈: ${dep.moduleName})`);
    if (dep.fn.inputs) lines.push(`  입력: ${dep.fn.inputs}`);
    if (dep.fn.outputs) lines.push(`  출력: ${dep.fn.outputs}`);
    if (dep.fn.behavior) {
      lines.push(`  동작:`);
      for (const bl of dep.fn.behavior.split('\n')) {
        lines.push(`    ${bl}`);
      }
    }
  }
  return lines.join('\n');
}

function buildTargetSection(moduleName: string, fn: FunctionSpec): string {
  const lines = [`[생성 대상 함수]`];
  lines.push(`function ${fn.name} (모듈: ${moduleName})`);
  if (fn.inputs) lines.push(`  입력: ${fn.inputs}`);
  if (fn.outputs) lines.push(`  출력: ${fn.outputs}`);
  if (fn.behavior) {
    lines.push(`  동작:`);
    for (const bl of fn.behavior.split('\n')) {
      lines.push(`    ${bl}`);
    }
  }
  return lines.join('\n');
}

function buildInstruction(spec: ProjectSpec): string {
  return [
    '[지시사항]',
    `위 명세에 따라 ${spec.language || '적절한 언어'}로 함수를 구현하세요.`,
    '코드만 출력하세요. 설명은 필요 없습니다.',
    spec.conventions ? `컨벤션: ${spec.conventions}` : '',
  ].filter(Boolean).join('\n');
}
