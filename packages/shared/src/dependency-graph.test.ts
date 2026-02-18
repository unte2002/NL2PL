import { describe, it, expect, beforeEach } from 'vitest';
import { parseSpec, resetIdCounter } from './spec-parser.js';
import { buildReverseDependencyMap, getAffectedFunctions } from './dependency-graph.js';

beforeEach(() => {
  resetIdCounter();
});

describe('buildReverseDependencyMap', () => {
  it('builds reverse deps for same-module references', () => {
    const spec = parseSpec(`
[모듈] 거래 처리

  function validate_transaction
    입력: transaction
    출력: bool

  function save_transaction
    입력: transaction
    출력: id
    동작:
      1. [validate_transaction] 호출
`);
    const map = buildReverseDependencyMap(spec);
    const validateId = spec.modules[0].functions[0].id;
    const saveId = spec.modules[0].functions[1].id;

    expect(map[validateId]).toEqual([saveId]);
  });

  it('builds reverse deps for cross-module references', () => {
    const spec = parseSpec(`
[모듈] 거래 처리

  function get_transactions
    입력: date_range
    출력: list

[모듈] 리포트

  function generate_report
    입력: date_range
    출력: report
    동작:
      1. [거래 처리.get_transactions] 호출
`);
    const map = buildReverseDependencyMap(spec);
    const getTransId = spec.modules[0].functions[0].id;
    const reportId = spec.modules[1].functions[0].id;

    expect(map[getTransId]).toEqual([reportId]);
  });

  it('handles unresolved references gracefully', () => {
    const spec = parseSpec(`
[모듈] 테스트

  function caller
    동작:
      1. [nonexistent_function] 호출
`);
    const map = buildReverseDependencyMap(spec);
    // No crash, just no entries for unresolved refs
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('handles functions with no dependencies', () => {
    const spec = parseSpec(`
[모듈] 테스트

  function standalone
    입력: x
    출력: y
    동작:
      1. x를 처리하여 y 반환
`);
    const map = buildReverseDependencyMap(spec);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('handles diamond dependencies', () => {
    const spec = parseSpec(`
[모듈] Core

  function base
    출력: data

  function middle_a
    동작:
      1. [base] 호출

  function middle_b
    동작:
      1. [base] 호출

  function top
    동작:
      1. [middle_a] 호출
      2. [middle_b] 호출
`);
    const map = buildReverseDependencyMap(spec);
    const [base, midA, midB, top] = spec.modules[0].functions;

    expect(map[base.id]).toContain(midA.id);
    expect(map[base.id]).toContain(midB.id);
    expect(map[midA.id]).toEqual([top.id]);
    expect(map[midB.id]).toEqual([top.id]);
  });
});

describe('getAffectedFunctions', () => {
  it('returns direct dependents', () => {
    const map = { fn_1: ['fn_2', 'fn_3'] };
    expect(getAffectedFunctions(map, 'fn_1')).toEqual(['fn_2', 'fn_3']);
  });

  it('returns empty for no dependents', () => {
    const map = { fn_1: ['fn_2'] };
    expect(getAffectedFunctions(map, 'fn_3')).toEqual([]);
  });
});
