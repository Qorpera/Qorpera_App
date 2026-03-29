// ── Generator Config Types ──────────────────────────────────────────────
// Consumed by clutter-templates.ts and activity-generator.ts to produce
// realistic synthetic content and activity signals for any company profile.

export interface EmployeeProfile {
  email: string;
  name: string;
  role: "ceo" | "manager" | "sales" | "engineer" | "field_worker" | "admin" | "junior";
  connectorProviders: string[];
}

export interface CompanyProfile {
  domain: string;
  name: string;
  employees: EmployeeProfile[];
  externalContacts: Array<{ name: string; email: string; company: string }>;
  connectorProviders: string[];
  locale: "da" | "en";
}

export interface ClutterConfig {
  systemNotifications: number;
  autoReplies: number;
  marketingNewsletters: number;
  transactional: number;
  calendarAuto: number;
  internalChatter: number;
}

export interface ActivityConfig {
  daysBack: number;
  weekendActivity: boolean;
}
