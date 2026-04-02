import type { ConnectorProvider } from "./types";
import { googleProvider } from "./google-provider";
import { googleSheetsProvider } from "./google-sheets";
import { hubspotProvider } from "./hubspot";
import { stripeProvider } from "./stripe";
import { slackProvider } from "./slack-provider";
import { microsoftProvider } from "./microsoft-provider";
import { economicProvider } from "./economic-provider";
import { googleAdsProvider } from "./google-ads-provider";
import { shopifyProvider } from "./shopify-provider";
import { linkedinProvider } from "./linkedin-provider";
import { metaAdsProvider } from "./meta-ads-provider";
import { pipedriveProvider } from "./pipedrive-provider";
import { salesforceProvider } from "./salesforce-provider";
import { intercomProvider } from "./intercom-provider";
import { zendeskProvider } from "./zendesk-provider";
import { dynamicsBcProvider } from "./dynamics-bc-provider";
import { sapProvider } from "./sap-provider";
import { oracleErpProvider } from "./oracle-erp-provider";
import { maerskProvider } from "./maersk-provider";
import { cargowiseProvider } from "./cargowise-provider";
import { dineroProvider } from "./dinero-provider";
import { pleoProvider } from "./pleo-provider";
import { xeroProvider } from "./xero-provider";
import { vismanetProvider } from "./vismanet-provider";
import { fortnoxProvider } from "./fortnox-provider";
import { sageProvider } from "./sage-provider";
import { exactOnlineProvider } from "./exact-online-provider";
import { netsuiteProvider } from "./netsuite-provider";
import { sapB1Provider } from "./sap-b1-provider";
import { hapagLloydProvider } from "./hapag-lloyd-provider";
import { project44Provider } from "./project44-provider";
import { xenetaProvider } from "./xeneta-provider";
import { mondayProvider } from "./monday-provider";
import { asanaProvider } from "./asana-provider";
import { jiraProvider } from "./jira-provider";
import { woocommerceProvider } from "./woocommerce-provider";
import { shipmondoProvider } from "./shipmondo-provider";
import { tracezillaProvider } from "./tracezilla-provider";

const PROVIDERS: ConnectorProvider[] = [hubspotProvider, stripeProvider, googleProvider, googleSheetsProvider, slackProvider, microsoftProvider, economicProvider, googleAdsProvider, shopifyProvider, linkedinProvider, metaAdsProvider, pipedriveProvider, salesforceProvider, intercomProvider, zendeskProvider, dynamicsBcProvider, sapProvider, oracleErpProvider, maerskProvider, cargowiseProvider, dineroProvider, pleoProvider, xeroProvider, vismanetProvider, fortnoxProvider, sageProvider, exactOnlineProvider, netsuiteProvider, sapB1Provider, hapagLloydProvider, project44Provider, xenetaProvider, mondayProvider, asanaProvider, jiraProvider, woocommerceProvider, shipmondoProvider, tracezillaProvider];

export type ProviderCategory = "productivity" | "communication" | "crm" | "finance" | "marketing" | "ecommerce" | "support" | "erp" | "logistics" | "project-management" | "expense-management";

export type ProviderMeta = {
  description: string;
  category: ProviderCategory;
  scopes: string[];
};

export const PROVIDER_META: Record<string, ProviderMeta> = {
  google: {
    description: "Gmail, Google Drive, Google Calendar, Google Sheets",
    category: "productivity",
    scopes: ["Email", "Files", "Calendar", "Spreadsheets"],
  },
  "google-sheets": {
    description: "Sync data from Google Sheets spreadsheets",
    category: "productivity",
    scopes: ["Spreadsheets"],
  },
  microsoft: {
    description: "Outlook, OneDrive, Microsoft Teams, Calendar",
    category: "productivity",
    scopes: ["Email", "Files", "Teams", "Calendar"],
  },
  slack: {
    description: "Channels, messages, and team communication",
    category: "communication",
    scopes: ["Messages", "Channels", "Users"],
  },
  hubspot: {
    description: "Contacts, companies, and deals",
    category: "crm",
    scopes: ["Contacts", "Companies", "Deals"],
  },
  pipedrive: {
    description: "Sales pipeline and deal management",
    category: "crm",
    scopes: ["Deals", "Contacts", "Activities"],
  },
  salesforce: {
    description: "Enterprise CRM — leads, opportunities, accounts",
    category: "crm",
    scopes: ["Leads", "Opportunities", "Accounts"],
  },
  stripe: {
    description: "Customers, invoices, and payment data",
    category: "finance",
    scopes: ["Customers", "Invoices", "Payments"],
  },
  economic: {
    description: "Visma e-conomic — accounting and invoicing",
    category: "finance",
    scopes: ["Invoices", "Accounts", "Journals"],
  },
  "google-ads": {
    description: "Campaign performance and ad spend data",
    category: "marketing",
    scopes: ["Campaigns", "Ad Groups", "Reports"],
  },
  linkedin: {
    description: "Company pages, campaigns, and analytics",
    category: "marketing",
    scopes: ["Pages", "Campaigns", "Analytics"],
  },
  "meta-ads": {
    description: "Facebook and Instagram ad campaigns",
    category: "marketing",
    scopes: ["Campaigns", "Ad Sets", "Insights"],
  },
  shopify: {
    description: "Orders, products, and customer data",
    category: "ecommerce",
    scopes: ["Orders", "Products", "Customers"],
  },
  intercom: {
    description: "Conversations, contacts, and help center",
    category: "support",
    scopes: ["Conversations", "Contacts", "Articles"],
  },
  zendesk: {
    description: "Tickets, users, and help desk data",
    category: "support",
    scopes: ["Tickets", "Users", "Organizations"],
  },
  "dynamics-bc": {
    description: "Financials, sales orders, purchase orders, inventory",
    category: "erp",
    scopes: ["Customers", "Vendors", "Sales Orders", "Purchase Orders", "Invoices", "Items"],
  },
  "sap-s4hana": {
    description: "SAP S/4HANA Cloud — sales orders, purchase orders, business partners, accounting",
    category: "erp",
    scopes: ["Business Partners", "Sales Orders", "Purchase Orders", "Accounting"],
  },
  "oracle-erp": {
    description: "Oracle ERP Cloud — purchase orders, invoices, suppliers, general ledger",
    category: "erp",
    scopes: ["Purchase Orders", "Invoices", "Suppliers", "General Ledger"],
  },
  maersk: {
    description: "Maersk ocean freight — container tracking, shipment visibility, ETA updates",
    category: "logistics",
    scopes: ["Shipments", "Containers", "Tracking Events"],
  },
  cargowise: {
    description: "CargoWise logistics ERP — shipments, customs, milestones, charges",
    category: "logistics",
    scopes: ["Shipments", "Customs", "Milestones", "Charges"],
  },
  dinero: {
    description: "Dinero accounting — invoices, contacts, products",
    category: "finance",
    scopes: ["Invoices", "Contacts", "Products"],
  },
  pleo: {
    description: "Pleo expense management — expenses, receipts, team members",
    category: "expense-management",
    scopes: ["Expenses", "Receipts", "Team Members"],
  },
  xero: {
    description: "Xero accounting — contacts, invoices, items",
    category: "finance",
    scopes: ["Contacts", "Invoices", "Items"],
  },
  vismanet: {
    description: "Visma.net ERP — customers, invoices, suppliers",
    category: "erp",
    scopes: ["Customers", "Invoices", "Suppliers"],
  },
  fortnox: {
    description: "Fortnox accounting — customers, invoices, articles",
    category: "finance",
    scopes: ["Customers", "Invoices", "Articles"],
  },
  sage: {
    description: "Sage Business Cloud — contacts, invoices, products",
    category: "finance",
    scopes: ["Contacts", "Invoices", "Products"],
  },
  "exact-online": {
    description: "Exact Online — invoices, accounts, items",
    category: "finance",
    scopes: ["Invoices", "Accounts", "Items"],
  },
  netsuite: {
    description: "Oracle NetSuite — sales orders, invoices, customers, vendors",
    category: "erp",
    scopes: ["Sales Orders", "Invoices", "Customers", "Vendors"],
  },
  "sap-b1": {
    description: "SAP Business One — orders, invoices, business partners",
    category: "erp",
    scopes: ["Orders", "Invoices", "Business Partners"],
  },
  "hapag-lloyd": {
    description: "Hapag-Lloyd ocean freight — container tracking, shipment visibility",
    category: "logistics",
    scopes: ["Shipments", "Containers", "Tracking Events"],
  },
  project44: {
    description: "project44 visibility — multi-carrier tracking, ETAs, milestones",
    category: "logistics",
    scopes: ["Shipments", "Containers", "Milestones"],
  },
  xeneta: {
    description: "Xeneta rate benchmarking — market rates, lane analytics",
    category: "logistics",
    scopes: ["Rate Benchmarks", "Lane Analytics"],
  },
  monday: {
    description: "Monday.com — boards, items, updates",
    category: "project-management",
    scopes: ["Boards", "Items", "Updates"],
  },
  asana: {
    description: "Asana — projects, tasks, teams",
    category: "project-management",
    scopes: ["Projects", "Tasks", "Teams"],
  },
  jira: {
    description: "Jira — issues, projects, sprints",
    category: "project-management",
    scopes: ["Issues", "Projects", "Sprints"],
  },
  woocommerce: {
    description: "WooCommerce — orders, products, customers",
    category: "ecommerce",
    scopes: ["Orders", "Products", "Customers"],
  },
  shipmondo: {
    description: "Shipmondo — shipments, sales orders, label generation",
    category: "logistics",
    scopes: ["Shipments", "Sales Orders", "Labels"],
  },
  tracezilla: {
    description: "Tracezilla — food ERP with lot traceability, orders, inventory",
    category: "erp",
    scopes: ["Sales Orders", "Purchase Orders", "Lots", "Inventory", "Deliveries", "SKUs"],
  },
};

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  productivity: "Productivity",
  communication: "Communication",
  crm: "CRM",
  finance: "Finance",
  "expense-management": "Expense Management",
  erp: "ERP",
  marketing: "Marketing",
  ecommerce: "E-commerce",
  logistics: "Logistics",
  "project-management": "Project Management",
  support: "Support",
};

// Display order for categories
export const CATEGORY_ORDER: ProviderCategory[] = [
  "productivity",
  "communication",
  "crm",
  "finance",
  "expense-management",
  "erp",
  "marketing",
  "ecommerce",
  "logistics",
  "project-management",
  "support",
];

export function getProvider(id: string): ConnectorProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function listProviders(): Array<{
  id: string;
  name: string;
  configSchema: ConnectorProvider["configSchema"];
  description: string;
  category: ProviderCategory;
  scopes: string[];
}> {
  return PROVIDERS.map((p) => {
    const meta = PROVIDER_META[p.id];
    return {
      id: p.id,
      name: p.name,
      configSchema: p.configSchema,
      description: meta?.description ?? "",
      category: meta?.category ?? "productivity",
      scopes: meta?.scopes ?? [],
    };
  });
}
