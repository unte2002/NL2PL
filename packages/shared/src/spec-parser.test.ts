import { describe, it, expect, beforeEach } from 'vitest';
import { parseSpec, extractDependencies, serializeSpec, resetIdCounter } from './spec-parser.js';

beforeEach(() => {
  resetIdCounter();
});

describe('parseSpec', () => {
  it('parses project header fields', () => {
    const input = `
언어: Python
프레임워크: FastAPI
DB: PostgreSQL
컨벤션: snake_case, 타입 힌트 필수
목적: 중소기업용 회계 프로그램
환경: .env에서 DB_URL 로드
전역 상태: 없음
외부 의존성: sqlalchemy 2.x
`;
    const spec = parseSpec(input);
    expect(spec.language).toBe('Python');
    expect(spec.framework).toBe('FastAPI');
    expect(spec.db).toBe('PostgreSQL');
    expect(spec.conventions).toBe('snake_case, 타입 힌트 필수');
    expect(spec.purpose).toBe('중소기업용 회계 프로그램');
    expect(spec.environment).toBe('.env에서 DB_URL 로드');
    expect(spec.globalState).toBe('없음');
    expect(spec.externalDeps).toBe('sqlalchemy 2.x');
  });

  it('parses a single module with no functions', () => {
    const input = `
언어: Python

[모듈] 거래 처리 - 거래 입력, 유효성 검사, 저장
`;
    const spec = parseSpec(input);
    expect(spec.modules).toHaveLength(1);
    expect(spec.modules[0].name).toBe('거래 처리');
    expect(spec.modules[0].description).toBe('거래 입력, 유효성 검사, 저장');
    expect(spec.modules[0].functions).toHaveLength(0);
  });

  it('parses module without description', () => {
    const input = `
[모듈] 리포트
`;
    const spec = parseSpec(input);
    expect(spec.modules[0].name).toBe('리포트');
    expect(spec.modules[0].description).toBe('');
  });

  it('parses functions with 입력/출력/동작', () => {
    const input = `
언어: Python

[모듈] 거래 처리

  function validate_transaction
    입력: transaction 객체
    출력: { valid: bool, errors: list }
    동작:
      1. amount가 0 이하인지 확인
      2. date가 유효한지 확인
      3. 결과 반환
`;
    const spec = parseSpec(input);
    const fn = spec.modules[0].functions[0];
    expect(fn.name).toBe('validate_transaction');
    expect(fn.inputs).toBe('transaction 객체');
    expect(fn.outputs).toBe('{ valid: bool, errors: list }');
    expect(fn.behavior).toContain('amount가 0 이하인지 확인');
    expect(fn.behavior).toContain('date가 유효한지 확인');
    expect(fn.behavior).toContain('결과 반환');
    expect(fn.status).toBe('empty');
  });

  it('parses inline dependencies from 동작 block', () => {
    const input = `
[모듈] 거래 처리

  function save_transaction
    입력: transaction 객체
    출력: transaction_id
    동작:
      1. [validate_transaction] 호출, 실패 시 오류 반환
      2. DB에 저장
      3. transaction_id 반환
`;
    const spec = parseSpec(input);
    const fn = spec.modules[0].functions[0];
    expect(fn.dependencies).toEqual(['validate_transaction']);
  });

  it('parses cross-module dependencies', () => {
    const input = `
[모듈] 리포트

  function generate_report
    입력: date_range
    출력: report 객체
    동작:
      1. [거래처리.get_transactions] 호출
      2. 집계 후 반환
`;
    const spec = parseSpec(input);
    const fn = spec.modules[0].functions[0];
    expect(fn.dependencies).toEqual(['거래처리.get_transactions']);
  });

  it('deduplicates dependency references', () => {
    const input = `
[모듈] 테스트

  function test_fn
    동작:
      1. [helper] 호출
      2. [helper] 다시 호출
`;
    const spec = parseSpec(input);
    expect(spec.modules[0].functions[0].dependencies).toEqual(['helper']);
  });

  it('parses multiple modules and functions', () => {
    const input = `
언어: Python

[모듈] 거래 처리 - 거래 관련

  function validate_transaction
    입력: transaction 객체
    출력: { valid: bool }

  function save_transaction
    입력: transaction 객체
    출력: transaction_id
    동작:
      1. [validate_transaction] 호출

[모듈] 리포트 - 집계 출력

  function monthly_report
    입력: month
    출력: report
    동작:
      1. [거래 처리.save_transaction] 참조
`;
    const spec = parseSpec(input);
    expect(spec.modules).toHaveLength(2);
    expect(spec.modules[0].functions).toHaveLength(2);
    expect(spec.modules[1].functions).toHaveLength(1);
    expect(spec.modules[0].name).toBe('거래 처리');
    expect(spec.modules[1].name).toBe('리포트');
  });

  it('handles function with no 동작 block', () => {
    const input = `
[모듈] API

  function get_user
    입력: user_id
    출력: user 객체
`;
    const spec = parseSpec(input);
    const fn = spec.modules[0].functions[0];
    expect(fn.behavior).toBe('');
    expect(fn.dependencies).toEqual([]);
  });

  it('handles function with only 동작 block', () => {
    const input = `
[모듈] Utils

  function init
    동작:
      1. 설정 파일 로드
      2. DB 연결
`;
    const spec = parseSpec(input);
    const fn = spec.modules[0].functions[0];
    expect(fn.inputs).toBe('');
    expect(fn.outputs).toBe('');
    expect(fn.behavior).toContain('설정 파일 로드');
  });

  it('handles module keyword in English', () => {
    const input = `
module Transactions

  function save
    입력: data
    출력: id
`;
    const spec = parseSpec(input);
    expect(spec.modules[0].name).toBe('Transactions');
  });

  it('ignores comment lines', () => {
    const input = `
// 이것은 주석입니다
# 이것도 주석입니다
언어: Python

[모듈] 테스트
  // 모듈 내 주석
  function test_fn
    입력: x
`;
    const spec = parseSpec(input);
    expect(spec.language).toBe('Python');
    expect(spec.modules[0].functions[0].inputs).toBe('x');
  });

  it('handles empty input', () => {
    const spec = parseSpec('');
    expect(spec.language).toBe('');
    expect(spec.modules).toHaveLength(0);
  });
});

describe('extractDependencies', () => {
  it('extracts simple references', () => {
    expect(extractDependencies('[foo] 호출')).toEqual(['foo']);
  });

  it('extracts cross-module references', () => {
    expect(extractDependencies('[mod.foo] 호출')).toEqual(['mod.foo']);
  });

  it('extracts multiple references', () => {
    const result = extractDependencies('[a] 호출 후 [b] 검증');
    expect(result).toEqual(['a', 'b']);
  });

  it('returns empty for no references', () => {
    expect(extractDependencies('그냥 텍스트')).toEqual([]);
  });
});

describe('serializeSpec', () => {
  it('round-trips a basic spec', () => {
    const input = `
언어: Python
프레임워크: FastAPI
목적: 테스트

[모듈] 거래 처리 - 거래 관련

  function validate_transaction
    입력: transaction
    출력: bool
    동작:
      1. 검증 수행
`;
    const parsed = parseSpec(input);
    const serialized = serializeSpec(parsed);
    resetIdCounter();
    const reparsed = parseSpec(serialized);

    expect(reparsed.language).toBe(parsed.language);
    expect(reparsed.framework).toBe(parsed.framework);
    expect(reparsed.modules).toHaveLength(1);
    expect(reparsed.modules[0].functions[0].name).toBe('validate_transaction');
    expect(reparsed.modules[0].functions[0].inputs).toBe('transaction');
    expect(reparsed.modules[0].functions[0].outputs).toBe('bool');
  });
});
