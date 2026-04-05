/* ── 속성 패널 (우측) ── */
import type { FC } from 'react';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import type { WfNodeData } from '@/types';

export const PropertyPanel: FC = () => {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const node = useWorkflowStore((s) =>
    s.nodes.find((n) => n.id === s.selectedNodeId),
  );
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeNode = useWorkflowStore((s) => s.removeNode);

  if (!node || !selectedNodeId) {
    return (
      <aside style={panelStyle}>
        <p style={{ color: '#64748b', fontSize: 13 }}>
          노드를 선택하면 속성을 편집할 수 있습니다.
        </p>
      </aside>
    );
  }

  const d = node.data as WfNodeData;

  const field = (label: string, key: keyof WfNodeData) => (
    <label style={{ display: 'block', marginBottom: 10 }} key={key}>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
      <input
        value={(d[key] as string) || ''}
        onChange={(e) => updateNodeData(selectedNodeId, { [key]: e.target.value })}
        style={inputStyle}
      />
    </label>
  );

  const textArea = (label: string, key: keyof WfNodeData) => (
    <label style={{ display: 'block', marginBottom: 10 }} key={key}>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
      <textarea
        rows={3}
        value={(d[key] as string) || ''}
        onChange={(e) => updateNodeData(selectedNodeId, { [key]: e.target.value })}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
    </label>
  );

  return (
    <aside style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
        속성 편집
      </div>
      <div
        style={{
          padding: '4px 8px',
          borderRadius: 4,
          background: '#334155',
          fontSize: 11,
          color: '#e2e8f0',
          marginBottom: 12,
          display: 'inline-block',
        }}
      >
        {d.kind}
      </div>

      {field('이름', 'label')}
      {field('담당 역할', 'role')}
      {field('부서', 'department')}
      {field('SLA (예: 2h)', 'sla')}
      {textArea('설명', 'description')}
      {d.kind === 'Decision' && field('분기 조건', 'nextCondition')}

      <button
        onClick={() => removeNode(selectedNodeId)}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '8px 0',
          background: '#dc2626',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        노드 삭제
      </button>
    </aside>
  );
};

const panelStyle: React.CSSProperties = {
  width: 260,
  background: 'rgba(15,23,42,.85)',
  borderLeft: '1px solid rgba(255,255,255,.1)',
  padding: 14,
  overflowY: 'auto',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.06)',
  color: '#e2e8f0',
  fontSize: 13,
  outline: 'none',
};
