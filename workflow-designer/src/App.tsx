/* ── 메인 App 컴포넌트 ── */
import { useEffect, useState, type FC } from 'react';
import { ReactFlowProvider } from 'reactflow';

import { NodeSidebar } from '@/components/NodeSidebar';
import { FlowCanvas } from '@/components/FlowCanvas';
import { PropertyPanel } from '@/components/PropertyPanel';
import { useWorkflowStore } from '@/store/useWorkflowStore';
import * as api from '@/api/client';

interface AppProps {
  workflowId: string;
}

const App: FC<AppProps> = ({ workflowId }) => {
  const [loading, setLoading] = useState(true);
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const loadDefinition = useWorkflowStore((s) => s.loadDefinition);
  const workflow = useWorkflowStore((s) => s.workflow);
  const dirty = useWorkflowStore((s) => s.dirty);
  const saving = useWorkflowStore((s) => s.saving);
  const save = useWorkflowStore((s) => s.save);

  /* ── 워크플로우 로드 ── */
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getWorkflow(workflowId);
        if (res.success && res.item) {
          setWorkflow(res.item);
          if (res.item.definition_json) {
            loadDefinition(res.item.definition_json);
          }
        }
      } catch (err) {
        console.error('워크플로우 로드 실패:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [workflowId, setWorkflow, loadDefinition]);

  /* ── Ctrl+S 단축키 ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  if (loading) {
    return (
      <div style={loadingStyle}>
        <div className="spinner" />
        <p>워크플로우 로딩 중...</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* ── 헤더 바 ── */}
        <header style={headerStyle}>
          <button
            onClick={() => window.history.back()}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}
          >
            ←
          </button>
          <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>
            {workflow?.name || '워크플로우'}
          </span>
          {workflow?.status && (
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 10,
                background:
                  workflow.status === 'active'
                    ? '#22c55e33'
                    : workflow.status === 'archived'
                    ? '#64748b33'
                    : '#f59e0b33',
                color:
                  workflow.status === 'active'
                    ? '#22c55e'
                    : workflow.status === 'archived'
                    ? '#94a3b8'
                    : '#f59e0b',
              }}
            >
              {workflow.status === 'draft'
                ? '초안'
                : workflow.status === 'active'
                ? '활성'
                : '보관'}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={save}
            disabled={saving || !dirty}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: 'none',
              background: dirty ? '#3b82f6' : '#334155',
              color: '#fff',
              cursor: dirty ? 'pointer' : 'default',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {saving ? '저장 중...' : dirty ? '💾 저장' : '저장됨'}
          </button>
        </header>

        {/* ── 3-패널 레이아웃 ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <NodeSidebar />
          <FlowCanvas />
          <PropertyPanel />
        </div>
      </div>
    </ReactFlowProvider>
  );
};

export default App;

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#94a3b8',
  gap: 12,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  background: 'rgba(15,23,42,.9)',
  borderBottom: '1px solid rgba(255,255,255,.08)',
};
