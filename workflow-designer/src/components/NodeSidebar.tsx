/* ── 노드 사이드바 (드래그 소스) ── */
import type { FC, DragEvent } from 'react';
import type { NodeKind } from '@/types';

const items: { kind: NodeKind; icon: string; label: string; color: string }[] = [
  { kind: 'Start',    icon: '▶', label: '시작',   color: '#22c55e' },
  { kind: 'Task',     icon: '📋', label: '작업',   color: '#3b82f6' },
  { kind: 'Approval', icon: '✅', label: '승인',   color: '#f59e0b' },
  { kind: 'Decision', icon: '◇', label: '분기',   color: '#a855f7' },
  { kind: 'System',   icon: '⚙', label: '시스템', color: '#14b8a6' },
  { kind: 'End',      icon: '⏹', label: '종료',   color: '#ef4444' },
];

const onDragStart = (e: DragEvent, kind: NodeKind) => {
  e.dataTransfer.setData('application/wf-node-kind', kind);
  e.dataTransfer.effectAllowed = 'move';
};

export const NodeSidebar: FC = () => (
  <aside
    style={{
      width: 180,
      background: 'rgba(15,23,42,.85)',
      borderRight: '1px solid rgba(255,255,255,.1)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      overflowY: 'auto',
    }}
  >
    <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
      노드 도구
    </div>
    {items.map((it) => (
      <div
        key={it.kind}
        draggable
        onDragStart={(e) => onDragStart(e, it.kind)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 6,
          border: `1px solid ${it.color}44`,
          background: `${it.color}11`,
          cursor: 'grab',
          color: '#e2e8f0',
          fontSize: 13,
        }}
      >
        <span style={{ fontSize: 18 }}>{it.icon}</span>
        <span>{it.label}</span>
      </div>
    ))}
  </aside>
);
