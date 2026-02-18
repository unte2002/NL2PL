import { useState, useCallback } from 'react';
import { useWebSocket } from './use-websocket.js';
import { useStore } from './store.js';
import { SpecEditor } from './components/spec-editor.js';
import { CodePanel } from './components/code-panel.js';
import { WarningPanel } from './components/warning-panel.js';
import { ProjectHeader } from './components/project-header.js';

export function App() {
  const { send } = useWebSocket();
  const spec = useStore((s) => s.spec);
  const specRaw = useStore((s) => s.specRaw);
  const warnings = useStore((s) => s.warnings);
  const [panelWidth, setPanelWidth] = useState(480);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setPanelWidth(Math.max(320, Math.min(800, startWidth + delta)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [panelWidth]);

  // Show loading state until we get spec data
  if (!spec && !specRaw) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
        <div className="text-center space-y-3">
          <div className="text-4xl font-black tracking-tight text-zinc-100">
            NL2PL
          </div>
          <p className="text-zinc-500 text-sm">Natural Language to Programming Language</p>
          <div className="mt-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-left max-w-sm">
            <p className="text-zinc-300 text-sm mb-2">spec.nl2pl 파일을 찾을 수 없습니다.</p>
            <p className="text-zinc-500 text-xs leading-relaxed">
              프로젝트 루트에 spec.nl2pl 파일을 생성하면 자동으로 감지됩니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-zinc-800/80 bg-zinc-950">
        <ProjectHeader spec={spec} />
      </header>

      {/* Main layout: two editors side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Spec editor */}
        <div
          className="flex-shrink-0 overflow-hidden bg-zinc-950"
          style={{ width: panelWidth }}
        >
          <SpecEditor send={send} />
        </div>

        {/* Resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
          onMouseDown={handleMouseDown}
        />

        {/* Right: Code panel + Warning panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <CodePanel send={send} />
          </div>

          {warnings.length > 0 && (
            <div className="flex-shrink-0 border-t border-zinc-800/80 max-h-52 overflow-y-auto">
              <WarningPanel send={send} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
