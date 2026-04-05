/* ── 커스텀 노드: 공통 래퍼 ── */
import { memo, type FC } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { WfNodeData, NodeKind } from '@/types';
import { useWorkflowStore } from '@/store/useWorkflowStore';

const kindMeta: Record<NodeKind, { icon: string; color: string }> = {
  Start:    { icon: '▶', color: '#22c55e' },
  Task:     { icon: '📋', color: '#3b82f6' },
  Approval: { icon: '✅', color: '#f59e0b' },
  Decision: { icon: '◇', color: '#a855f7' },
  System:   { icon: '⚙', color: '#14b8a6' },
  End:      { icon: '⏹', color: '#ef4444' },
};

const WfNode: FC<NodeProps<WfNodeData>> = ({ id, data, selected }) => {
  const meta = kindMeta[data.kind] || kindMeta.Task;
  const selectNode = useWorkflowStore((s) => s.selectNode);

  return (
    <div
      onClick={() => selectNode(id)}
      className="wf-node"
      style={{
        border: `2px solid ${selected ? '#fff' : meta.color}`,
        borderRadius: data.kind === 'Decision' ? 0 : 8,
        transform: data.kind === 'Decision' ? 'rotate(45deg)' : undefined,
        background: `${meta.color}22`,
        padding: '10px 16px',
        minWidth: 120,
        textAlign: 'center',
        cursor: 'grab',
        position: 'relative',
        boxShadow: selected
          ? `0 0 0 2px ${meta.color}`
          : '0 2px 6px rgba(0,0,0,.25)',
      }}
    >
      {/* 핸들 */}
      {data.kind !== 'Start' && (
        <Handle type="target" position={Position.Top} />
      )}
      {data.kind !== 'End' && (
        <Handle type="source" position={Position.Bottom} />
      )}

      <div
        style={{
          transform: data.kind === 'Decision' ? 'rotate(-45deg)' : undefined,
        }}
      >
        <div style={{ fontSize: 20 }}>{meta.icon}</div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#e2e8f0',
            marginTop: 4,
          }}
        >
          {data.label || data.kind}
        </div>
      </div>
    </div>
  );
};

export const StartNode = memo(WfNode);
export const TaskNode = memo(WfNode);
export const ApprovalNode = memo(WfNode);
export const DecisionNode = memo(WfNode);
export const SystemNode = memo(WfNode);
export const EndNode = memo(WfNode);

export const nodeTypes = {
  Start: StartNode,
  Task: TaskNode,
  Approval: ApprovalNode,
  Decision: DecisionNode,
  System: SystemNode,
  End: EndNode,
};
