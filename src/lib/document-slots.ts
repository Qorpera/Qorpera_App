export const DOCUMENT_SLOT_TYPES = {
  "org-chart": {
    label: "Org Chart",
    icon: "network",
    description: "Organizational chart showing team members and reporting lines",
    extractsEntities: true,
    extractsProperties: false,
  },
  "budget": {
    label: "Budget",
    icon: "wallet",
    description: "Department budget allocation and financial targets",
    extractsEntities: false,
    extractsProperties: true,
  },
  "compensation": {
    label: "Compensation",
    icon: "banknotes",
    description: "Team member salary and compensation data",
    extractsEntities: false,
    extractsProperties: true,
  },
  "team-roster": {
    label: "Team Roster",
    icon: "clipboard-list",
    description: "List of team members with roles and contact information",
    extractsEntities: true,
    extractsProperties: false,
  },
} as const;

export type SlotType = keyof typeof DOCUMENT_SLOT_TYPES;
export type DocumentType = SlotType | "context";

// Check if a document type is a structural slot
export function isStructuralSlot(type: string): type is SlotType {
  return type in DOCUMENT_SLOT_TYPES;
}
