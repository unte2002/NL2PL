import { create } from 'zustand';
import type { ProjectSpec } from '@nl2pl/shared';

export interface Warning {
  id: string;
  changedFunction: string;
  affected: string[];
  changeType: 'interface' | 'behavior';
}

interface AppState {
  // Spec state
  spec: ProjectSpec | null;
  specRaw: string;
  selectedFunctionId: string | null;

  // Code generation state
  generatedCode: Record<string, string>;
  generatingIds: Set<string>;

  // Warnings
  warnings: Warning[];

  // Actions
  setSpec: (spec: ProjectSpec, raw: string) => void;
  setSpecRaw: (raw: string) => void;
  selectFunction: (id: string | null) => void;
  appendGeneratedCode: (functionId: string, chunk: string) => void;
  clearGeneratedCode: (functionId: string) => void;
  markGenerating: (functionId: string, generating: boolean) => void;
  addWarning: (warning: Warning) => void;
  dismissWarning: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  spec: null,
  specRaw: '',
  selectedFunctionId: null,
  generatedCode: {},
  generatingIds: new Set(),
  warnings: [],

  setSpec: (spec, raw) => set({ spec, specRaw: raw }),

  setSpecRaw: (raw) => set({ specRaw: raw }),

  selectFunction: (id) => set({ selectedFunctionId: id }),

  appendGeneratedCode: (functionId, chunk) =>
    set((state) => ({
      generatedCode: {
        ...state.generatedCode,
        [functionId]: (state.generatedCode[functionId] ?? '') + chunk,
      },
    })),

  clearGeneratedCode: (functionId) =>
    set((state) => {
      const { [functionId]: _, ...rest } = state.generatedCode;
      return { generatedCode: rest };
    }),

  markGenerating: (functionId, generating) =>
    set((state) => {
      const next = new Set(state.generatingIds);
      if (generating) next.add(functionId);
      else next.delete(functionId);
      return { generatingIds: next };
    }),

  addWarning: (warning) =>
    set((state) => ({ warnings: [...state.warnings, warning] })),

  dismissWarning: (id) =>
    set((state) => ({
      warnings: state.warnings.filter((w) => w.id !== id),
    })),
}));
