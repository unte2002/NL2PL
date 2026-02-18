import type { ClientMessage } from '@nl2pl/shared';
import { useStore, type Warning } from '../store.js';

interface WarningPanelProps {
  send: (msg: ClientMessage) => void;
}

export function WarningPanel({ send }: WarningPanelProps) {
  const warnings = useStore((s) => s.warnings);
  const spec = useStore((s) => s.spec);
  const { dismissWarning, selectFunction, clearGeneratedCode, markGenerating } = useStore();

  const findFunctionName = (id: string): string => {
    if (!spec) return id;
    for (const mod of spec.modules) {
      for (const fn of mod.functions) {
        if (fn.id === id) return fn.name;
      }
    }
    return id;
  };

  const handleRegenerate = (warning: Warning, functionId: string) => {
    clearGeneratedCode(functionId);
    markGenerating(functionId, true);
    selectFunction(functionId);
    send({ type: 'generate', functionId });
    dismissWarning(warning.id);
  };

  const handleDismiss = (warning: Warning) => {
    dismissWarning(warning.id);
    send({ type: 'dismiss_warning', functionId: warning.changedFunction });
  };

  if (warnings.length === 0) return null;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-widest">
          경고 {warnings.length}개
        </span>
      </div>

      <div className="space-y-2">
        {warnings.map((warning) => (
          <div
            key={warning.id}
            className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                  warning.changeType === 'interface'
                    ? 'bg-red-900/30 text-red-400'
                    : 'bg-amber-900/30 text-amber-400'
                }`}>
                  {warning.changeType === 'interface' ? '인터페이스 변경' : '로직 변경'}
                </span>
              </div>
              <button
                onClick={() => handleDismiss(warning)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"
                title="무시"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-zinc-300 mb-2">
              <span className="font-mono text-amber-300">{warning.changedFunction}</span>
              <span className="text-zinc-500">
                {warning.changeType === 'interface'
                  ? '의 입력/출력이 변경됨'
                  : '의 동작이 변경됨'}
              </span>
            </p>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-zinc-600">영향:</span>
              {warning.affected.map((id) => (
                <button
                  key={id}
                  onClick={() => handleRegenerate(warning, id)}
                  className="text-[11px] font-medium font-mono px-2 py-0.5 bg-amber-700/40 hover:bg-amber-600/50 border border-amber-700/40 rounded-md text-amber-300 transition-colors"
                >
                  {findFunctionName(id)} 재생성
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
