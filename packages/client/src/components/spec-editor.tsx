import { useRef, useEffect, useCallback, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor, languages, IDisposable, IEvent } from 'monaco-editor';
import type { ClientMessage } from '@nl2pl/shared';
import { useStore } from '../store.js';

const LANG_ID = 'nl2pl-spec';

interface SpecEditorProps {
  send: (msg: ClientMessage) => void;
}

export function SpecEditor({ send }: SpecEditorProps) {
  const specRaw = useStore((s) => s.specRaw);
  const spec = useStore((s) => s.spec);
  const generatingIds = useStore((s) => s.generatingIds);
  const { setSpecRaw, clearGeneratedCode, markGenerating, selectFunction } = useStore();

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Emitter used to tell Monaco to re-call provideCodeLenses
  const codeLensEmitterRef = useRef<{ fire: () => void } | null>(null);
  // Incremented each time the editor mounts so the CodeLens effect re-runs after mount
  const [mountTick, setMountTick] = useState(0);

  // Keep a ref to generatingIds so the CodeLens provider always reads the latest
  // value without needing to be in the effect dependency array.
  const generatingIdsRef = useRef<Set<string>>(generatingIds);
  useEffect(() => {
    generatingIdsRef.current = generatingIds;
  }, [generatingIds]);

  // Send spec updates to server with debounce
  const sendSpecUpdate = useCallback((raw: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      send({ type: 'update_spec', raw });
    }, 500);
  }, [send]);

  const handleChange = useCallback((value: string | undefined) => {
    const raw = value ?? '';
    setSpecRaw(raw);
    sendSpecUpdate(raw);
  }, [setSpecRaw, sendSpecUpdate]);

  // Generate code for a function
  const handleGenerate = useCallback((functionId: string) => {
    clearGeneratedCode(functionId);
    markGenerating(functionId, true);
    selectFunction(functionId);
    send({ type: 'generate', functionId });
  }, [clearGeneratedCode, markGenerating, selectFunction, send]);

  // Keep handleGenerate in a ref so CodeLens command closures don't go stale
  const handleGenerateRef = useRef(handleGenerate);
  useEffect(() => {
    handleGenerateRef.current = handleGenerate;
  }, [handleGenerate]);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    // Register custom language (only once)
    if (!monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === LANG_ID)) {
      monaco.languages.register({ id: LANG_ID });
      monaco.languages.setMonarchTokensProvider(LANG_ID, createTokensProvider());
      monaco.languages.setLanguageConfiguration(LANG_ID, {
        comments: { lineComment: '//' },
        folding: {
          markers: {
            start: /^\s*(\[모듈\]|module\s|function\s)/i,
            end: /^(?=\s*(\[모듈\]|module\s|function\s))/i,
          },
        },
      });

      // Define theme colors
      monaco.editor.defineTheme('nl2pl-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword.module', foreground: 'C586C0', fontStyle: 'bold' },
          { token: 'keyword.function', foreground: '569CD6', fontStyle: 'bold' },
          { token: 'keyword.field', foreground: '4EC9B0' },
          { token: 'string.reference', foreground: 'DCDCAA' },
          { token: 'comment', foreground: '6A9955' },
          { token: 'keyword.header', foreground: '9CDCFE' },
        ],
        colors: {
          'editor.background': '#09090b',
        },
      });
    }
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Folding: module & function blocks fold via indentation (default) + markers
    editor.updateOptions({
      folding: true,
      foldingStrategy: 'indentation',
    });

    // Signal that the editor is ready so the CodeLens effect can run
    setMountTick((n) => n + 1);
  }, [setMountTick]);

  // Register CodeLens provider + commands whenever spec changes.
  // generatingIds is intentionally NOT in the dependency array — we read it
  // via generatingIdsRef so the provider always sees the latest value without
  // tearing down and re-creating all commands on every state change.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !spec) return;

    // Dispose previous registrations
    disposablesRef.current.forEach((d) => d.dispose());
    disposablesRef.current = [];

    // Create an emitter so we can tell Monaco to re-call provideCodeLenses
    // without disposing and re-registering the entire provider.
    const emitter = new monaco.Emitter<void>();
    codeLensEmitterRef.current = emitter;

    const provider = monaco.languages.registerCodeLensProvider(LANG_ID, {
      onDidChange: emitter.event as IEvent<void>,
      provideCodeLenses: (model: editor.ITextModel) => {
        const lenses: languages.CodeLens[] = [];
        const lines = model.getLinesContent();

        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          const funcMatch = trimmed.match(/^\[?function\]?\s+(.+)$/i);
          if (funcMatch) {
            const fnName = funcMatch[1].trim();
            const fnId = findFunctionId(fnName);
            if (fnId) {
              // Read the latest generating state via ref — no stale closure
              const isGenerating = generatingIdsRef.current.has(fnId);
              lenses.push({
                range: {
                  startLineNumber: i + 1,
                  startColumn: 1,
                  endLineNumber: i + 1,
                  endColumn: 1,
                },
                command: {
                  id: isGenerating ? '' : `nl2pl.generate.${fnId}`,
                  title: isGenerating ? '$(loading~spin) 생성 중...' : '▶ 코드 생성',
                },
              });
            }
          }
        }

        return { lenses, dispose: () => { } };
      },
    });

    // Register a single command per function; the handler reads the latest
    // handleGenerate via ref so it never goes stale.
    for (const mod of spec.modules) {
      for (const fn of mod.functions) {
        const cmdId = `nl2pl.generate.${fn.id}`;
        const fnId = fn.id;
        const d = monaco.editor.registerCommand(cmdId, () => {
          handleGenerateRef.current(fnId);
        });
        disposablesRef.current.push(d);
      }
    }

    disposablesRef.current.push(provider);

    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, mountTick]); // Re-register when spec changes OR after editor mounts

  // Refresh CodeLens whenever generating state changes so the button label updates.
  // Firing the emitter causes Monaco to re-call provideCodeLenses immediately.
  useEffect(() => {
    codeLensEmitterRef.current?.fire();
  }, [generatingIds]);

  function findFunctionId(name: string): string | null {
    if (!spec) return null;
    for (const mod of spec.modules) {
      for (const fn of mod.functions) {
        if (fn.name === name) return fn.id;
      }
    }
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 border-b border-zinc-800/80 bg-zinc-900/50">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
          spec.nl2pl
        </span>
        <span className="text-[11px] text-zinc-600">
          {spec ? `${spec.modules.length}개 모듈 · ${spec.modules.reduce((sum, m) => sum + m.functions.length, 0)}개 함수` : ''}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={LANG_ID}
          value={specRaw}
          theme="nl2pl-dark"
          onChange={handleChange}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'gutter',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            folding: true,
            foldingStrategy: 'indentation',
            glyphMargin: true,
            codeLens: true,
            lineDecorationsWidth: 8,
          }}
        />
      </div>
    </div>
  );
}

/** Monarch tokenizer for the spec.nl2pl format */
function createTokensProvider(): languages.IMonarchLanguage {
  return {
    tokenizer: {
      root: [
        // Comments
        [/\/\/.*$/, 'comment'],
        [/#.*$/, 'comment'],

        // Module keyword
        [/^\s*\[모듈\]/, 'keyword.module'],
        [/^\s*module\b/i, 'keyword.module'],

        // Function keyword
        [/^\s*\[?function\]?/i, 'keyword.function'],

        // Field keywords
        [/^\s*입력:/, 'keyword.field'],
        [/^\s*출력:/, 'keyword.field'],
        [/^\s*동작:/, 'keyword.field'],

        // Header keywords
        [/^\s*언어:/, 'keyword.header'],
        [/^\s*프레임워크:/, 'keyword.header'],
        [/^\s*DB:/, 'keyword.header'],
        [/^\s*컨벤션:/, 'keyword.header'],
        [/^\s*목적:/, 'keyword.header'],
        [/^\s*환경:/, 'keyword.header'],
        [/^\s*전역 상태:/, 'keyword.header'],
        [/^\s*외부 의존성:/, 'keyword.header'],

        // Dependency references [함수명] or [모듈.함수명]
        [/\[[^\]]+\]/, 'string.reference'],
      ],
    },
  };
}
