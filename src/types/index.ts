import type { LucideIcon } from 'lucide-react';

export type ModuleTier = 'core' | 'extended' | 'signature';
export type RiskLevel = 'autonomous' | 'approval' | 'sealed';

export interface AgentModule {
  id: number;
  code: string;
  name: string;
  tagline: string;
  functionality: string;
  execution: string;
  inputs: string[];
  action: string;
  benefit: string;
  tier: ModuleTier;
  risk: RiskLevel;
  icon: LucideIcon;
}

export type ApprovalStatus = 'pending' | 'approved' | 'edited' | 'cancelled';

export interface ApprovalRequest {
  id: string;
  moduleCode: string;
  moduleName: string;
  action: string;
  target: string;
  payload: string;
  risk: RiskLevel;
  createdAt: number;
  status: ApprovalStatus;
  resolvedAt?: number;
}

export type Speaker = 'user' | 'zyron' | 'system';

export interface ConsoleMessage {
  id: string;
  speaker: Speaker;
  body: string;
  routedTo?: string[];
  approval?: ApprovalRequest;
  createdAt: number;
  pending?: boolean;
}

export interface Commitment {
  id: string;
  text: string;
  owner: string;
  due: string | null;
  source: string;
  state: 'open' | 'nudged' | 'closed';
  createdAt: number;
}

export type StorageKind = 'mongo' | 'memory';
