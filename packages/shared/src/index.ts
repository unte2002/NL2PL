export * from './types.js';
export { parseSpec, serializeSpec, extractDependencies, resetIdCounter } from './spec-parser.js';
export { buildReverseDependencyMap, getAffectedFunctions } from './dependency-graph.js';
export { diffSpecs } from './spec-diff.js';
