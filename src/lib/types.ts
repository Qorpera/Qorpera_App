// ─── Entity Types ─────────────────────────────────────────

export type DataType = "STRING" | "NUMBER" | "DATE" | "BOOLEAN" | "ENUM" | "CURRENCY";
export type IdentityRole = "email" | "domain" | "phone" | null;
export type EntityStatus = "active" | "archived" | "merged";

export interface EntityTypeView {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  propertyCount: number;
  entityCount: number;
  properties: PropertyView[];
}

export interface PropertyView {
  id: string;
  name: string;
  slug: string;
  dataType: DataType;
  required: boolean;
  filterable: boolean;
  displayOrder: number;
  enumValues: string[] | null;
  identityRole: IdentityRole;
}

export interface EntityView {
  id: string;
  displayName: string;
  status: EntityStatus;
  entityType: { id: string; name: string; slug: string; icon: string; color: string };
  properties: Record<string, string>;
  sourceSystem: string | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipTypeView {
  id: string;
  name: string;
  slug: string;
  fromType: { id: string; name: string; slug: string };
  toType: { id: string; name: string; slug: string };
  description: string;
  count: number;
}

export interface RelationshipView {
  id: string;
  type: { name: string; slug: string };
  from: { id: string; displayName: string; typeSlug: string };
  to: { id: string; displayName: string; typeSlug: string };
}

// ─── Graph Types ──────────────────────────────────────────

export interface GraphNode {
  id: string;
  displayName: string;
  entityType: string;
  typeSlug: string;
  icon: string;
  color: string;
  properties: Record<string, string>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  typeSlug: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Policy Types ─────────────────────────────────────────

export type PolicyEffect = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
export type PolicyScope = "global" | "entity_type" | "entity";

export interface PolicyRuleView {
  id: string;
  name: string;
  scope: PolicyScope;
  scopeTargetId: string | null;
  actionType: string;
  effect: PolicyEffect;
  conditions: Record<string, unknown> | null;
  priority: number;
  enabled: boolean;
}

// ─── Proposal Types ───────────────────────────────────────

export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface ProposalView {
  id: string;
  actionType: string;
  description: string;
  entityId: string | null;
  entityTypeSlug: string | null;
  sourceAgent: string | null;
  inputData: Record<string, unknown> | null;
  status: ProposalStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  expiresAt: string | null;
}

// ─── Audit Types ──────────────────────────────────────────

export interface AuditEntryView {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  entityId: string | null;
  entityTypeSlug: string | null;
  outcome: string;
  createdAt: string;
  policyRuleId: string | null;
  proposalId: string | null;
}

// ─── Recommendation Types ─────────────────────────────────

export interface RecommendationView {
  id: string;
  title: string;
  description: string;
  reasoning: string | null;
  actionType: string | null;
  entityId: string | null;
  entityTypeSlug: string | null;
  confidence: number;
  priority: string;
  status: string;
  createdAt: string;
}

// ─── Electron API ─────────────────────────────────────────

export interface ElectronAPI {
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
