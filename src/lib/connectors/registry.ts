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

const PROVIDERS: ConnectorProvider[] = [hubspotProvider, stripeProvider, googleProvider, googleSheetsProvider, slackProvider, microsoftProvider, economicProvider, googleAdsProvider, shopifyProvider, linkedinProvider, metaAdsProvider, pipedriveProvider, salesforceProvider, intercomProvider, zendeskProvider, dynamicsBcProvider, sapProvider, oracleErpProvider];

export type ProviderCategory = "productivity" | "communication" | "crm" | "finance" | "marketing" | "ecommerce" | "support" | "erp" | "logistics";

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
};

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  productivity: "Productivity",
  communication: "Communication",
  crm: "CRM",
  finance: "Finance",
  erp: "ERP",
  marketing: "Marketing",
  ecommerce: "E-commerce",
  logistics: "Logistics",
  support: "Support",
};

// Display order for categories
export const CATEGORY_ORDER: ProviderCategory[] = [
  "productivity",
  "communication",
  "crm",
  "finance",
  "erp",
  "marketing",
  "ecommerce",
  "logistics",
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
