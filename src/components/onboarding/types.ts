export type OnboardingStep = 1 | 2 | 3 | 4;

export interface Department {
  id: string;
  displayName: string;
  description: string | null;
  mapX: number | null;
  mapY: number | null;
  memberCount: number;
  entityType: { slug: string };
}

export interface Member {
  id: string;
  displayName: string;
  propertyValues: Array<{
    property: { slug: string; name: string; dataType: string };
    value: string;
  }>;
  crossDomain?: boolean;
  homeDomain?: string | null;
  homeDomainId?: string | null;
  departmentRole?: string | null;
  relationshipId?: string | null;
}

export interface InternalDoc {
  id: string;
  fileName: string;
  documentType: string;
  status: string;
  embeddingStatus: string;
}

export interface DocsData {
  slots: Record<string, InternalDoc[]>;
  contextDocs: InternalDoc[];
}

export interface PersonDiff {
  action: string;
  name: string;
  role?: string;
  email?: string;
  existingEntityId?: string;
  changes?: Record<string, { from: string; to: string }>;
  selected: boolean;
}

export interface PropertyDiff {
  action: string;
  targetEntityId: string;
  targetEntityName: string;
  property: string;
  label: string;
  oldValue?: string;
  newValue: string;
  selected: boolean;
}

export interface ExtractionDiff {
  type: string;
  people?: PersonDiff[];
  properties?: PropertyDiff[];
  summary: string;
}

export interface Provider {
  id: string;
  name: string;
  configured: boolean;
  configSchema?: Array<{ key: string; label: string; type: string; required: boolean; placeholder?: string }>;
}
