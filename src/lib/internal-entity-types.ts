// Shared seed data for internal entity types (used by document ingestor and copilot tools)

export const INTERNAL_ENTITY_TYPE_SEEDS: Record<string, { name: string; icon: string; color: string }> = {
  "organization": { name: "Organization", icon: "building-2", color: "#6366f1" },
  "department": { name: "Department", icon: "users", color: "#8b5cf6" },
  "team-member": { name: "Team Member", icon: "user", color: "#a78bfa" },
  "role": { name: "Role", icon: "briefcase", color: "#c084fc" },
  "process": { name: "Process", icon: "workflow", color: "#e879f9" },
  "policy": { name: "Policy", icon: "shield", color: "#f0abfc" },
};
