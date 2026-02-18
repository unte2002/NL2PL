import { useEffect, useRef, useCallback } from 'react';
import type { ServerMessage, ClientMessage } from '@nl2pl/shared';
import { useStore } from './store.js';

let warnCounter = 0;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const { setSpec, appendGeneratedCode, markGenerating, addWarning } = useStore();

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;

      switch (msg.type) {
        case 'spec_updated':
          setSpec(msg.spec, msg.raw);
          break;

        case 'generation_chunk':
          appendGeneratedCode(msg.functionId, msg.chunk);
          break;

        case 'generation_done':
          markGenerating(msg.functionId, false);
          break;

        case 'dependency_warning':
          addWarning({
            id: `warn_${++warnCounter}`,
            changedFunction: msg.changedFunction,
            affected: msg.affected,
            changeType: msg.changeType,
          });
          break;
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 2000);
    };

    return () => {
      ws.close();
    };
  }, [setSpec, appendGeneratedCode, markGenerating, addWarning]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
