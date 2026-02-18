// --- Node Status ---

export type NodeStatus = 'empty' | 'generated' | 'stale';
// empty:     코드 생성 전
// generated: 코드 생성 완료, 파일에 저장됨
// stale:     의존 함수 인터페이스 변경으로 재생성 권장

// --- Spec Tree ---

export interface FunctionSpec {
  id: string;
  name: string;
  inputs: string;         // 원문 그대로 보존
  outputs: string;        // 원문 그대로 보존
  behavior: string;       // 원문 그대로 보존, LLM에 그대로 전달
  dependencies: string[]; // [함수명] 또는 [모듈명.함수명] 파싱 결과
  outputPath?: string;    // 저장된 파일 경로
  status: NodeStatus;
}

export interface ModuleSpec {
  id: string;
  name: string;
  description: string;
  functions: FunctionSpec[];
}

export interface ProjectSpec {
  language: string;
  framework: string;
  db?: string;
  conventions: string;
  purpose: string;
  environment?: string;
  globalState?: string;
  externalDeps?: string;
  modules: ModuleSpec[];
}

// --- WebSocket Messages ---

export type ServerMessage =
  | { type: 'spec_updated'; spec: ProjectSpec; raw: string }
  | { type: 'dependency_warning'; affected: string[]; changedFunction: string; changeType: 'interface' | 'behavior' }
  | { type: 'generation_chunk'; functionId: string; chunk: string }
  | { type: 'generation_done'; functionId: string };

export type ClientMessage =
  | { type: 'generate'; functionId: string }
  | { type: 'update_spec'; raw: string }
  | { type: 'save_file'; functionId: string; path: string; code: string }
  | { type: 'dismiss_warning'; functionId: string };

// --- Dependency Graph ---

/** Reverse dependency map: key = function id, value = list of function ids that depend on it */
export type ReverseDependencyMap = Record<string, string[]>;

// --- Spec Diff ---

export type ChangeType = 'interface' | 'behavior' | 'none';

export interface FunctionChange {
  functionId: string;
  functionName: string;
  changeType: ChangeType;
}
