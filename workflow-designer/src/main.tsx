/* ── React 엔트리포인트 ── */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Flask 템플릿에서 호출:
 *   window.__initWfDesigner(containerId, workflowId)
 *
 * 빌드 후 static/workflow-designer/assets/index.js 로 번들됨.
 */
(window as any).__initWfDesigner = (
  containerId: string,
  workflowId: string,
) => {
  const el = document.getElementById(containerId);
  if (!el) {
    console.error(`[WfDesigner] #${containerId} 을 찾을 수 없습니다`);
    return;
  }
  createRoot(el).render(
    <StrictMode>
      <App workflowId={workflowId} />
    </StrictMode>,
  );
};

/* 자동 부트: data attribute 사용 */
document.addEventListener('DOMContentLoaded', () => {
  const el = document.querySelector<HTMLElement>('[data-wf-designer]');
  if (el) {
    const wfId = el.dataset.wfDesigner || '';
    (window as any).__initWfDesigner(el.id || 'root', wfId);
  }
});
