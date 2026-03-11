export const DOCUMENT_SLOT_TYPES = {
  "org-chart": {
    label: "Org Chart",
    icon: "network",
    description: "Organizational structure documents — org charts, reporting lines, hierarchy",
    extractsEntities: true,
    extractsProperties: false,
  },
  "playbook": {
    label: "Playbook",
    icon: "clipboard-list",
    description: "Job manuals, process guides, SOPs for the department",
    extractsEntities: false,
    extractsProperties: false,
  },
} as const;

export type SlotType = keyof typeof DOCUMENT_SLOT_TYPES;
export type DocumentType = SlotType | "context";

// Check if a document type is a structural slot
export function isStructuralSlot(type: string): type is SlotType {
  return type in DOCUMENT_SLOT_TYPES;
}
