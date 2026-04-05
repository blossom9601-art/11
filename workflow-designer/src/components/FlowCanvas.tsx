/* ── React Flow 캔버스 ── */
import { useCallback, useRef, type FC, type DragEvent } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useWorkflowStore, genNodeId } from '@/store/useWorkflowStore';
import { nodeTypes } from '@/components/WfNode';
import type { NodeKind, WfNodeData } from '@/types';

export const FlowCanvas: FC = () => {
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const setViewport = useWorkflowStore((s) => s.setViewport);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfRef.current = instance;
  }, []);

  /* ── 드래그 앤 드롭 ── */
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(
        'application/wf-node-kind',
      ) as NodeKind;
      if (!kind || !rfRef.current) return;

      const position = rfRef.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode = {
        id: genNodeId(),
        type: kind,
        position,
        data: { label: kind, kind } as WfNodeData,
      };
      addNode(newNode);
    },
    [addNode],
  );

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        onMoveEnd={(_, vp) => setViewport(vp)}
        fitView
        deleteKeyCode="Delete"
        snapToGrid
        snapGrid={[15, 15]}
        style={{ background: '#0f172a' }}
      >
        <Background gap={20} color="rgba(255,255,255,.04)" />
        <Controls
          style={{ background: '#1e293b', borderColor: 'rgba(255,255,255,.1)' }}
        />
        <MiniMap
          nodeColor={(n) => {
            const colors: Record<string, string> = {
              Start: '#22c55e',
              Task: '#3b82f6',
              Approval: '#f59e0b',
              Decision: '#a855f7',
              System: '#14b8a6',
              End: '#ef4444',
            };
            return colors[n.type || ''] || '#64748b';
          }}
          maskColor="rgba(0,0,0,.6)"
          style={{ background: '#1e293b' }}
        />
      </ReactFlow>
    </div>
  );
};
