type HardcodedTypeDef = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultCategory: string; // "foundational" | "base" | "internal" | "digital" | "external"
  properties: Array<{
    slug: string;
    name: string;
    dataType: string;
    identityRole?: string;
  }>;
};

export const HARDCODED_TYPE_DEFS: Record<string, HardcodedTypeDef> = {
  contact: {
    slug: "contact",
    name: "Contact",
    description: "A person from CRM or payment systems",
    icon: "user",
    color: "#3b82f6",
    defaultCategory: "external",
    properties: [
      { slug: "email", name: "Email", dataType: "STRING", identityRole: "email" },
      { slug: "phone", name: "Phone", dataType: "STRING", identityRole: "phone" },
      { slug: "job-title", name: "Job Title", dataType: "STRING" },
      { slug: "currency", name: "Currency", dataType: "STRING" },
      { slug: "stripe-customer-id", name: "Stripe Customer ID", dataType: "STRING" },
      { slug: "balance", name: "Balance", dataType: "NUMBER" },
      { slug: "delinquent", name: "Delinquent", dataType: "BOOLEAN" },
    ],
  },
  company: {
    slug: "company",
    name: "Company",
    description: "An organization from CRM",
    icon: "building",
    color: "#8b5cf6",
    defaultCategory: "external",
    properties: [
      { slug: "domain", name: "Domain", dataType: "STRING", identityRole: "domain" },
      { slug: "industry", name: "Industry", dataType: "STRING" },
      { slug: "revenue", name: "Revenue", dataType: "CURRENCY" },
      { slug: "employee-count", name: "Employee Count", dataType: "NUMBER" },
    ],
  },
  deal: {
    slug: "deal",
    name: "Deal",
    description: "A sales deal or opportunity",
    icon: "handshake",
    color: "#22c55e",
    defaultCategory: "digital",
    properties: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "stage", name: "Stage", dataType: "STRING" },
      { slug: "close-date", name: "Close Date", dataType: "DATE" },
      { slug: "pipeline", name: "Pipeline", dataType: "STRING" },
    ],
  },
  invoice: {
    slug: "invoice",
    name: "Invoice",
    description: "An invoice from payment or billing systems",
    icon: "file-text",
    color: "#f59e0b",
    defaultCategory: "digital",
    properties: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "status", name: "Status", dataType: "STRING" },
      { slug: "due-date", name: "Due Date", dataType: "DATE" },
      { slug: "currency", name: "Currency", dataType: "STRING" },
      { slug: "paid-date", name: "Paid Date", dataType: "DATE" },
      { slug: "amount-paid", name: "Amount Paid", dataType: "CURRENCY" },
    ],
  },
  payment: {
    slug: "payment",
    name: "Payment",
    description: "A payment transaction",
    icon: "credit-card",
    color: "#10b981",
    defaultCategory: "digital",
    properties: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "currency", name: "Currency", dataType: "STRING" },
      { slug: "status", name: "Status", dataType: "STRING" },
      { slug: "payment-date", name: "Payment Date", dataType: "DATE" },
    ],
  },
  department: {
    slug: "department",
    name: "Department",
    description: "An organizational department or division",
    icon: "users",
    color: "#8b5cf6",
    defaultCategory: "foundational",
    properties: [],
  },
  organization: {
    slug: "organization",
    name: "Organization",
    description: "The top-level company entity",
    icon: "building-2",
    color: "#6366f1",
    defaultCategory: "foundational",
    properties: [],
  },
  "team-member": {
    slug: "team-member",
    name: "Team Member",
    description: "An internal team member",
    icon: "user-check",
    color: "#a855f7",
    defaultCategory: "base",
    properties: [
      { slug: "email", name: "Email", dataType: "STRING", identityRole: "email" },
      { slug: "role", name: "Role", dataType: "STRING" },
      { slug: "phone", name: "Phone", dataType: "STRING", identityRole: "phone" },
    ],
  },
  role: {
    slug: "role",
    name: "Role",
    description: "A job role or position",
    icon: "badge",
    color: "#a855f7",
    defaultCategory: "base",
    properties: [],
  },
  process: {
    slug: "process",
    name: "Process",
    description: "A business process or workflow",
    icon: "workflow",
    color: "#a855f7",
    defaultCategory: "internal",
    properties: [],
  },
  policy: {
    slug: "policy",
    name: "Policy",
    description: "A business policy or rule document",
    icon: "shield",
    color: "#a855f7",
    defaultCategory: "internal",
    properties: [],
  },
  document: {
    slug: "document",
    name: "Document",
    description: "An uploaded document providing context or structural data",
    icon: "file-text",
    color: "#64748b",
    defaultCategory: "internal",
    properties: [
      { slug: "document-type", name: "Document Type", dataType: "STRING" },
      { slug: "page-count", name: "Page Count", dataType: "NUMBER" },
    ],
  },
};

// Category priority for merge hierarchy
export const CATEGORY_PRIORITY: Record<string, number> = {
  foundational: 5,
  base: 4,
  internal: 3,
  digital: 2,
  external: 1,
};
