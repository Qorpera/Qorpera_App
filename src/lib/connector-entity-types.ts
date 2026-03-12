// Maps connector providers to the entity type slugs they produce
export const CONNECTOR_ENTITY_TYPES: Record<string, { slug: string; label: string }[]> = {
  hubspot: [
    { slug: "contact", label: "Contacts" },
    { slug: "company", label: "Companies" },
    { slug: "deal", label: "Deals" },
  ],
  stripe: [
    { slug: "contact", label: "Customers" },
    { slug: "invoice", label: "Invoices" },
    { slug: "payment", label: "Payments" },
  ],
  "google-sheets": [
    { slug: "record", label: "All Rows" },
  ],
};
