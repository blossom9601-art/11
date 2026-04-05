/* ── Zustand 워크플로우 스토어 ── */
import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from 'reactflow';
import type { WfNodeData, WfDesign, DefinitionJson } from '@/types';
import * as api from '@/api/client';

interface WorkflowState {
  /* ── 메타 ── */
  workflow: WfDesign | null;
  dirty: boolean;
  saving: boolean;

  /* ── React Flow ── */
  nodes: Node<WfNodeData>[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };

  /* ── 선택 ── */
  selectedNodeId: string | null;

  /* ── 액션 ── */
  setWorkflow: (wf: WfDesign) => void;
  loadDefinition: (def: DefinitionJson) => void;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setViewport: (vp: { x: number; y: number; zoom: number }) => void;

  addNode: (node: Node<WfNodeData>) => void;
  updateNodeData: (id: string, data: Partial<WfNodeData>) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;

  save: () => Promise<void>;
}

let _nextId = 1;
export const genNodeId = () => `node_${Date.now()}_${_nextId++}`;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: null,
  dirty: false,
  saving: false,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,

  setWorkflow: (wf) => set({ workflow: wf }),

  loadDefinition: (def) =>
    set({
      nodes: def.nodes || [],
      edges: def.edges || [],
      viewport: def.viewport || { x: 0, y: 0, zoom: 1 },
      dirty: false,
    }),

  onNodesChange: (changes) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      dirty: true,
    })),

  onEdgesChange: (changes) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: true,
    })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge(
        { ...connection, type: 'smoothstep', animated: true },
        s.edges,
      ),
      dirty: true,
    })),

  setViewport: (vp) => set({ viewport: vp }),

  addNode: (node) =>
    set((s) => ({ nodes: [...s.nodes, node], dirty: true })),

  updateNodeData: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      dirty: true,
    })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      dirty: true,
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  save: async () => {
    const { workflow, nodes, edges, viewport } = get();
    if (!workflow) return;
    set({ saving: true });
    try {
      await api.saveVersion(workflow.id, { nodes, edges, viewport });
      set({ dirty: false });
    } finally {
      set({ saving: false });
    }
  },
}));
