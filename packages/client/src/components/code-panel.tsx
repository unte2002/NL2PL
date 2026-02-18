import { useState } from 'react';
import Editor from '@monaco-editor/react';
import type { ClientMessage } from '@nl2pl/shared';
import { useStore } from '../store.js';

interface CodePanelProps {
  send: (msg: ClientMessage) => void;
}

export function CodePanel({ send }: CodePanelProps) {
  const selectedFunctionId = useStore((s) => s.selectedFunctionId);
  const generatedCode = useStore((s) => s.generatedCode);
  const generatingIds = useStore((s) => s.generatingIds);
  const spec = useStore((s) => s.spec);

  const [savePath, setSavePath] = useState('');
  const [saved, setSaved] = useState(false);

  const code = selectedFunctionId ? generatedCode[selectedFunctionId] ?? '' : '';
  const isGenerating = selectedFunctionId ? generatingIds.has(selectedFunctionId) : false;

  // Find selected function name for display
  let selectedFnName = '';
  if (spec && selectedFunctionId) {
    for (const mod of spec.modules) {
      for (const fn of mod.functions) {
        if (fn.id === selectedFunctionId) {
          selectedFnName = fn.name;
          break;
        }
      }
      if (selectedFnName) break;
    }
  }

  const langMap: Record<string, string> = {
    python: 'python',
    javascript: 'javascript',
    typescript: 'typescript',
    java: 'java',
    go: 'go',
    rust: 'rust',
    c: 'c',
    'c++': 'cpp',
    cpp: 'cpp',
  };
  const monacoLang = langMap[spec?.language?.toLowerCase() ?? ''] ?? 'plaintext';

  // Empty states
  if (!selectedFunctionId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="text-zinc-700 text-3xl">{ }</div>
          <p className="text-zinc-600 text-sm">왼쪽 트리에서 함수를 선택하세요</p>
        </div>
      </div>
    );
  }

  if (!code && !isGenerating) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="font-mono text-zinc-600 text-sm">{selectedFnName}</div>
          <p className="text-zinc-600 text-xs">"코드 생성" 버튼을 클릭하여 코드를 생성하세요</p>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    if (!savePath.trim() || !selectedFunctionId) return;
    send({
      type: 'save_file',
      functionId: selectedFunctionId,
      path: savePath.trim(),
      code,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: function name + status */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-zinc-800/80 bg-zinc-900/50">
        <span className="font-mono text-xs text-zinc-400">{selectedFnName}</span>
        {isGenerating && (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            생성 중
          </span>
        )}
        {code && !isGenerating && (
          <span className="text-[11px] text-zinc-600">
            {code.split('\n').length}줄
          </span>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={monacoLang}
          value={code}
          theme="vs-dark"
          options={{
            readOnly: isGenerating,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'gutter',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
          }}
        />
      </div>

      {/* Save bar */}
      {code && !isGenerating && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-t border-zinc-800/80 bg-zinc-900/50">
          <input
            type="text"
            value={savePath}
            onChange={(e) => { setSavePath(e.target.value); setSaved(false); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="저장 경로 (예: src/transactions.py)"
            className="flex-1 bg-zinc-900 border border-zinc-700/60 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/15 transition-colors font-mono"
          />
          <button
            onClick={handleSave}
            disabled={!savePath.trim()}
            className={`text-xs font-medium px-4 py-1.5 rounded-md transition-all ${saved
                ? 'bg-emerald-600 text-white'
                : !savePath.trim()
                  ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.98]'
              }`}
          >
            {saved ? '저장됨' : '파일에 저장'}
          </button>
        </div>
      )}
    </div>
  );
}
