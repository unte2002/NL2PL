import { describe, it, expect, beforeEach } from 'vitest';
import { parseSpec, resetIdCounter } from './spec-parser.js';
import { diffSpecs } from './spec-diff.js';

beforeEach(() => {
  resetIdCounter();
});

const BASE_SPEC = `
[모듈] 거래 처리

  function validate_transaction
    입력: transaction 객체
    출력: { valid: bool, errors: list }
    동작:
      1. amount 검증
      2. date 검증

  function save_transaction
    입력: transaction 객체
    출력: transaction_id
    동작:
      1. [validate_transaction] 호출
      2. DB 저장
`;

describe('diffSpecs', () => {
  it('detects interface change when 입력 changes', () => {
    const oldSpec = parseSpec(BASE_SPEC);
    resetIdCounter();
    const newRaw = BASE_SPEC.replace(
      '입력: transaction 객체\n    출력: { valid: bool, errors: list }',
      '입력: transaction 객체, options\n    출력: { valid: bool, errors: list }',
    );
    const newSpec = parseSpec(newRaw);

    const changes = diffSpecs(oldSpec, newSpec);
    expect(changes).toHaveLength(1);
    expect(changes[0].functionName).toBe('validate_transaction');
    expect(changes[0].changeType).toBe('interface');
  });

  it('detects interface change when 출력 changes', () => {
    const oldSpec = parseSpec(BASE_SPEC);
    resetIdCounter();
    const newRaw = BASE_SPEC.replace(
      '출력: { valid: bool, errors: list }',
      '출력: { valid: bool, errors: list, warnings: list }',
    );
    const newSpec = parseSpec(newRaw);

    const changes = diffSpecs(oldSpec, newSpec);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('interface');
  });

  it('detects behavior change when only 동작 changes', () => {
    const oldSpec = parseSpec(BASE_SPEC);
    resetIdCounter();
    const newRaw = BASE_SPEC.replace(
      '1. amount 검증',
      '1. amount가 0보다 큰지 검증',
    );
    const newSpec = parseSpec(newRaw);

    const changes = diffSpecs(oldSpec, newSpec);
    expect(changes).toHaveLength(1);
    expect(changes[0].functionName).toBe('validate_transaction');
    expect(changes[0].changeType).toBe('behavior');
  });

  it('returns empty when nothing changed', () => {
    const oldSpec = parseSpec(BASE_SPEC);
    resetIdCounter();
    const newSpec = parseSpec(BASE_SPEC);

    const changes = diffSpecs(oldSpec, newSpec);
    expect(changes).toHaveLength(0);
  });

  it('ignores whitespace-only changes', () => {
    const oldSpec = parseSpec(BASE_SPEC);
    resetIdCounter();
    const newRaw = BASE_SPEC.replace('amount 검증', 'amount  검증');
    const newSpec = parseSpec(newRaw);

    const changes = diffSpecs(oldSpec, newSpec);
    expect(changes).toHaveLength(0);
  });

  it('detects changes in multiple functions', () => {
    const oldSpec = parseSpec(BASE_SPEC);
    resetIdCounter();
    const newRaw = BASE_SPEC
      .replace('입력: transaction 객체\n    출력: { valid: bool, errors: list }',
               '입력: transaction 객체, strict\n    출력: { valid: bool, errors: list }')
      .replace('2. DB 저장', '2. DB 트랜잭션으로 저장');
    const newSpec = parseSpec(newRaw);

    const changes = diffSpecs(oldSpec, newSpec);
    expect(changes).toHaveLength(2);

    const validate = changes.find((c) => c.functionName === 'validate_transaction');
    const save = changes.find((c) => c.functionName === 'save_transaction');
    expect(validate?.changeType).toBe('interface');
    expect(save?.changeType).toBe('behavior');
  });
});
