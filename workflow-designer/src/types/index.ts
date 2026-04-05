/* ── 워크플로우 디자이너 타입 정의 ── */

export type NodeKind =
  | 'Start'
  | 'Task'
  | 'Approval'
  | 'Decision'
  | 'System'
  | 'End';

export interface WfNodeData {
  label: string;
  kind: NodeKind;
  role?: string;
  department?: string;
  sla?: string;
  description?: string;
  nextCondition?: string;
}

export interface WfDesign {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'archived';
  owner_user_id: number | null;
  latest_version: number;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

export interface WfDesignVersion {
  id: string;
  workflow_id: string;
  version: number;
  definition_json: DefinitionJson;
  created_by: number | null;
  created_at: string;
}

export interface DefinitionJson {
  nodes: import('reactflow').Node<WfNodeData>[];
  edges: import('reactflow').Edge[];
  viewport: { x: number; y: number; zoom: number };
}

export interface ApiListResponse<T> {
  success: boolean;
  rows: T[];
  total: number;
  error?: string;
}

export interface ApiItemResponse<T> {
  success: boolean;
  item: T;
  error?: string;
}
