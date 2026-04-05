/* ── Flask 백엔드 API 클라이언트 ── */
import type {
  WfDesign,
  WfDesignVersion,
  DefinitionJson,
  ApiListResponse,
  ApiItemResponse,
} from '@/types';

const BASE = '/api/wf-designs';

function handleRes<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ── 워크플로우 CRUD ── */

export async function listWorkflows(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  my_only?: boolean;
}): Promise<ApiListResponse<WfDesign>> {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.per_page) q.set('per_page', String(params.per_page));
  if (params?.search) q.set('search', params.search);
  if (params?.status) q.set('status', params.status);
  if (params?.my_only) q.set('my_only', '1');
  const url = q.toString() ? `${BASE}?${q}` : BASE;
  return fetch(url).then((r) => handleRes(r));
}

export async function getWorkflow(
  id: string,
): Promise<ApiItemResponse<WfDesign & { definition_json?: DefinitionJson }>> {
  return fetch(`${BASE}/${id}`).then((r) => handleRes(r));
}

export async function createWorkflow(
  name: string,
  description?: string,
): Promise<ApiItemResponse<WfDesign>> {
  return fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  }).then((r) => handleRes(r));
}

export async function updateWorkflow(
  id: string,
  data: Partial<Pick<WfDesign, 'name' | 'description' | 'status'>>,
): Promise<ApiItemResponse<WfDesign>> {
  return fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => handleRes(r));
}

export async function bulkDeleteWorkflows(
  ids: string[],
): Promise<{ success: boolean; deleted: number }> {
  return fetch(`${BASE}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then((r) => handleRes(r));
}

/* ── 버전 ── */

export async function listVersions(
  wfId: string,
): Promise<ApiListResponse<WfDesignVersion>> {
  return fetch(`${BASE}/${wfId}/versions`).then((r) => handleRes(r));
}

export async function saveVersion(
  wfId: string,
  definition: DefinitionJson,
): Promise<ApiItemResponse<WfDesignVersion>> {
  return fetch(`${BASE}/${wfId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ definition_json: definition }),
  }).then((r) => handleRes(r));
}

export async function getVersion(
  wfId: string,
  version: number,
): Promise<ApiItemResponse<WfDesignVersion>> {
  return fetch(`${BASE}/${wfId}/versions/${version}`).then((r) =>
    handleRes(r),
  );
}
