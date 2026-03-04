import type { PrismaClient } from "@prisma/client";

export async function seedEntities(prisma: PrismaClient, operatorId: string) {
  // Check if already seeded
  const existing = await prisma.oemEntityType.count({ where: { operatorId } });
  if (existing > 0) {
    console.log("Entity types already exist, skipping seed.");
    return;
  }

  // ── Entity Types ─────────────────────────────────────────────

  const customerType = await prisma.oemEntityType.create({
    data: {
      operatorId, name: "Customers", slug: "customer", description: "Business customers and clients", icon: "\uD83D\uDC65", color: "#3b82f6",
      properties: { create: [
        { name: "Email", slug: "email", dataType: "STRING", required: true, filterable: true, displayOrder: 0, identityRole: "email" },
        { name: "Phone", slug: "phone", dataType: "STRING", filterable: true, displayOrder: 1, identityRole: "phone" },
        { name: "Company", slug: "company", dataType: "STRING", filterable: true, displayOrder: 2 },
        { name: "Industry", slug: "industry", dataType: "STRING", filterable: true, displayOrder: 3 },
        { name: "Annual Revenue", slug: "annual_revenue", dataType: "CURRENCY", filterable: true, displayOrder: 4 },
        { name: "Status", slug: "status", dataType: "ENUM", filterable: true, displayOrder: 5, enumValues: JSON.stringify(["active", "churned", "prospect"]) },
      ]},
    },
    include: { properties: true },
  });

  const employeeType = await prisma.oemEntityType.create({
    data: {
      operatorId, name: "Employees", slug: "employee", description: "Internal team members", icon: "\uD83D\uDC64", color: "#8b5cf6",
      properties: { create: [
        { name: "Email", slug: "email", dataType: "STRING", required: true, filterable: true, displayOrder: 0, identityRole: "email" },
        { name: "Department", slug: "department", dataType: "STRING", filterable: true, displayOrder: 1 },
        { name: "Role", slug: "role", dataType: "STRING", filterable: true, displayOrder: 2 },
        { name: "Start Date", slug: "start_date", dataType: "DATE", displayOrder: 3 },
      ]},
    },
    include: { properties: true },
  });

  const invoiceType = await prisma.oemEntityType.create({
    data: {
      operatorId, name: "Invoices", slug: "invoice", description: "Financial invoices and billing records", icon: "\uD83D\uDCDC", color: "#f59e0b",
      properties: { create: [
        { name: "Amount", slug: "amount", dataType: "CURRENCY", required: true, filterable: true, displayOrder: 0 },
        { name: "Due Date", slug: "due_date", dataType: "DATE", filterable: true, displayOrder: 1 },
        { name: "Status", slug: "status", dataType: "ENUM", filterable: true, displayOrder: 2, enumValues: JSON.stringify(["draft", "sent", "paid", "overdue"]) },
        { name: "Invoice Number", slug: "invoice_number", dataType: "STRING", displayOrder: 3 },
      ]},
    },
    include: { properties: true },
  });

  const ticketType = await prisma.oemEntityType.create({
    data: {
      operatorId, name: "Tickets", slug: "ticket", description: "Support tickets and issues", icon: "\uD83C\uDFAB", color: "#ef4444",
      properties: { create: [
        { name: "Priority", slug: "priority", dataType: "ENUM", filterable: true, displayOrder: 0, enumValues: JSON.stringify(["low", "medium", "high", "critical"]) },
        { name: "Status", slug: "status", dataType: "ENUM", filterable: true, displayOrder: 1, enumValues: JSON.stringify(["open", "in_progress", "resolved", "closed"]) },
        { name: "Category", slug: "category", dataType: "STRING", filterable: true, displayOrder: 2 },
        { name: "Description", slug: "description", dataType: "STRING", displayOrder: 3 },
      ]},
    },
    include: { properties: true },
  });

  const productType = await prisma.oemEntityType.create({
    data: {
      operatorId, name: "Products", slug: "product", description: "Products and services offered", icon: "\uD83D\uDCE6", color: "#10b981",
      properties: { create: [
        { name: "SKU", slug: "sku", dataType: "STRING", filterable: true, displayOrder: 0 },
        { name: "Price", slug: "price", dataType: "CURRENCY", filterable: true, displayOrder: 1 },
        { name: "Category", slug: "category", dataType: "STRING", filterable: true, displayOrder: 2 },
        { name: "In Stock", slug: "in_stock", dataType: "BOOLEAN", filterable: true, displayOrder: 3 },
      ]},
    },
    include: { properties: true },
  });

  const supplierType = await prisma.oemEntityType.create({
    data: {
      operatorId, name: "Suppliers", slug: "supplier", description: "External suppliers and vendors", icon: "\uD83D\uDE9A", color: "#06b6d4",
      properties: { create: [
        { name: "Domain", slug: "domain", dataType: "STRING", filterable: true, displayOrder: 0, identityRole: "domain" },
        { name: "Contact Email", slug: "contact_email", dataType: "STRING", filterable: true, displayOrder: 1, identityRole: "email" },
        { name: "Category", slug: "category", dataType: "STRING", filterable: true, displayOrder: 2 },
        { name: "Rating", slug: "rating", dataType: "NUMBER", filterable: true, displayOrder: 3 },
      ]},
    },
    include: { properties: true },
  });

  console.log("Created 6 entity types");

  // Helper to get property ID by slug
  const propId = (type: typeof customerType, slug: string) =>
    type.properties.find((p) => p.slug === slug)!.id;

  // ── Entities ─────────────────────────────────────────────────

  const createEntityWithProps = async (
    typeData: typeof customerType,
    name: string,
    props: Record<string, string>,
  ) => {
    const entity = await prisma.oemEntity.create({
      data: { operatorId, entityTypeId: typeData.id, displayName: name },
    });
    for (const [slug, value] of Object.entries(props)) {
      const pid = typeData.properties.find((p) => p.slug === slug)?.id;
      if (pid) {
        await prisma.oemEntityPropertyValue.create({
          data: { entityId: entity.id, propertyId: pid, value },
        });
      }
    }
    return entity;
  };

  // Customers
  const acme = await createEntityWithProps(customerType, "Acme Corp", {
    email: "contact@acme.com", phone: "+1-555-0101", company: "Acme Corp", industry: "Manufacturing", annual_revenue: "2500000", status: "active",
  });
  const globex = await createEntityWithProps(customerType, "Globex Industries", {
    email: "info@globex.com", phone: "+1-555-0102", company: "Globex Industries", industry: "Technology", annual_revenue: "5000000", status: "active",
  });
  const initech = await createEntityWithProps(customerType, "Initech Solutions", {
    email: "hello@initech.io", phone: "+1-555-0103", company: "Initech Solutions", industry: "Software", annual_revenue: "1200000", status: "active",
  });
  const wayne = await createEntityWithProps(customerType, "Wayne Enterprises", {
    email: "business@wayne.com", phone: "+1-555-0104", company: "Wayne Enterprises", industry: "Conglomerate", annual_revenue: "85000000", status: "active",
  });
  const umbrella = await createEntityWithProps(customerType, "Umbrella Corp", {
    email: "sales@umbrella.co", company: "Umbrella Corp", industry: "Pharmaceuticals", annual_revenue: "12000000", status: "prospect",
  });

  // Employees
  const sarah = await createEntityWithProps(employeeType, "Sarah Johnson", {
    email: "sarah@company.com", department: "Sales", role: "Account Executive", start_date: "2023-03-15",
  });
  const mike = await createEntityWithProps(employeeType, "Mike Chen", {
    email: "mike@company.com", department: "Engineering", role: "Tech Lead", start_date: "2022-01-10",
  });
  const lisa = await createEntityWithProps(employeeType, "Lisa Park", {
    email: "lisa@company.com", department: "Support", role: "Support Manager", start_date: "2023-06-01",
  });
  const james = await createEntityWithProps(employeeType, "James Wilson", {
    email: "james@company.com", department: "Finance", role: "CFO", start_date: "2021-09-01",
  });

  // Invoices
  const inv001 = await createEntityWithProps(invoiceType, "INV-2024-001", {
    amount: "15000", due_date: "2024-02-15", status: "paid", invoice_number: "INV-2024-001",
  });
  const inv002 = await createEntityWithProps(invoiceType, "INV-2024-002", {
    amount: "32000", due_date: "2024-03-01", status: "overdue", invoice_number: "INV-2024-002",
  });
  const inv003 = await createEntityWithProps(invoiceType, "INV-2024-003", {
    amount: "8500", due_date: "2024-04-15", status: "sent", invoice_number: "INV-2024-003",
  });
  const inv004 = await createEntityWithProps(invoiceType, "INV-2024-004", {
    amount: "125000", due_date: "2024-03-30", status: "draft", invoice_number: "INV-2024-004",
  });

  // Tickets
  const tkt001 = await createEntityWithProps(ticketType, "Login issues - Acme Corp", {
    priority: "high", status: "open", category: "Authentication", description: "Users unable to login after password reset",
  });
  const tkt002 = await createEntityWithProps(ticketType, "Feature request - Globex", {
    priority: "medium", status: "in_progress", category: "Feature Request", description: "Request for bulk export functionality",
  });
  const tkt003 = await createEntityWithProps(ticketType, "Billing discrepancy - Initech", {
    priority: "high", status: "open", category: "Billing", description: "Invoice amount doesn't match contract terms",
  });

  // Products
  const prodA = await createEntityWithProps(productType, "Enterprise Suite", {
    sku: "ENT-001", price: "5000", category: "Software", in_stock: "true",
  });
  const prodB = await createEntityWithProps(productType, "Starter Package", {
    sku: "STR-001", price: "500", category: "Software", in_stock: "true",
  });
  const prodC = await createEntityWithProps(productType, "Consulting Hours", {
    sku: "CON-010", price: "250", category: "Services", in_stock: "true",
  });

  // Suppliers
  const cloudCo = await createEntityWithProps(supplierType, "CloudCo Hosting", {
    domain: "cloudco.io", contact_email: "partners@cloudco.io", category: "Infrastructure", rating: "4.5",
  });
  const dataVault = await createEntityWithProps(supplierType, "DataVault Inc", {
    domain: "datavault.com", contact_email: "sales@datavault.com", category: "Data Storage", rating: "4.2",
  });

  console.log("Created 22 entities");

  // ── Relationship Types & Relationships ───────────────────────

  const owes = await prisma.oemRelationshipType.create({
    data: { operatorId, name: "Owes", slug: "owes", fromEntityTypeId: customerType.id, toEntityTypeId: invoiceType.id, description: "Customer owes payment on invoice" },
  });
  const belongsTo = await prisma.oemRelationshipType.create({
    data: { operatorId, name: "Belongs To", slug: "belongs_to", fromEntityTypeId: ticketType.id, toEntityTypeId: customerType.id, description: "Ticket filed by customer" },
  });
  const manages = await prisma.oemRelationshipType.create({
    data: { operatorId, name: "Manages", slug: "manages", fromEntityTypeId: employeeType.id, toEntityTypeId: customerType.id, description: "Employee manages customer account" },
  });
  const supplies = await prisma.oemRelationshipType.create({
    data: { operatorId, name: "Supplies", slug: "supplies", fromEntityTypeId: supplierType.id, toEntityTypeId: productType.id, description: "Supplier provides product" },
  });
  const purchased = await prisma.oemRelationshipType.create({
    data: { operatorId, name: "Purchased", slug: "purchased", fromEntityTypeId: customerType.id, toEntityTypeId: productType.id, description: "Customer purchased product" },
  });

  // Create relationship instances
  const rels = [
    { rtId: owes.id, from: acme.id, to: inv001.id },
    { rtId: owes.id, from: globex.id, to: inv002.id },
    { rtId: owes.id, from: initech.id, to: inv003.id },
    { rtId: owes.id, from: wayne.id, to: inv004.id },
    { rtId: belongsTo.id, from: tkt001.id, to: acme.id },
    { rtId: belongsTo.id, from: tkt002.id, to: globex.id },
    { rtId: belongsTo.id, from: tkt003.id, to: initech.id },
    { rtId: manages.id, from: sarah.id, to: acme.id },
    { rtId: manages.id, from: sarah.id, to: globex.id },
    { rtId: manages.id, from: mike.id, to: initech.id },
    { rtId: manages.id, from: james.id, to: wayne.id },
    { rtId: supplies.id, from: cloudCo.id, to: prodA.id },
    { rtId: supplies.id, from: dataVault.id, to: prodB.id },
    { rtId: purchased.id, from: acme.id, to: prodA.id },
    { rtId: purchased.id, from: globex.id, to: prodA.id },
    { rtId: purchased.id, from: initech.id, to: prodB.id },
    { rtId: purchased.id, from: wayne.id, to: prodA.id },
  ];

  for (const r of rels) {
    await prisma.oemEntityRelationship.create({
      data: { relationshipTypeId: r.rtId, fromEntityId: r.from, toEntityId: r.to },
    });
  }
  console.log(`Created ${rels.length} relationships`);

  // ── Policy Rules ─────────────────────────────────────────────

  const policies = [
    { name: "Allow read all entities", scope: "global", actionType: "read", effect: "ALLOW", priority: 100 },
    { name: "Allow create entities", scope: "global", actionType: "create", effect: "ALLOW", priority: 50 },
    { name: "Allow update entities", scope: "global", actionType: "update", effect: "ALLOW", priority: 50 },
    { name: "Require approval for deletes", scope: "global", actionType: "delete", effect: "REQUIRE_APPROVAL", priority: 80 },
    { name: "Require approval for high-value invoices", scope: "entity_type", scopeTargetId: "invoice", actionType: "create", effect: "REQUIRE_APPROVAL", priority: 90, conditions: JSON.stringify({ minAmount: 50000 }) },
    { name: "Block mass entity deletion", scope: "global", actionType: "delete", effect: "DENY", priority: 95, conditions: JSON.stringify({ batchSize: 100 }) },
    { name: "Require approval for customer status changes", scope: "entity_type", scopeTargetId: "customer", actionType: "update", effect: "REQUIRE_APPROVAL", priority: 70 },
    { name: "Allow workflow execution", scope: "global", actionType: "execute", effect: "ALLOW", priority: 40 },
  ];

  for (const p of policies) {
    await prisma.policyRule.create({
      data: {
        operatorId,
        name: p.name,
        scope: p.scope,
        scopeTargetId: (p as Record<string, unknown>).scopeTargetId as string ?? null,
        actionType: p.actionType,
        effect: p.effect,
        priority: p.priority,
        conditions: (p as Record<string, unknown>).conditions as string ?? null,
      },
    });
  }
  console.log(`Created ${policies.length} policy rules`);

  // ── Action Rules ───────────────────────────────────────────────

  const actionRules = [
    {
      name: "Flag overdue invoices",
      description: "Flags invoices with overdue status for manual review",
      entityTypeSlug: "invoice",
      triggerOn: "tick",
      conditions: JSON.stringify([{ field: "status", operator: "equals", value: "overdue" }]),
      actionType: "flag_for_review",
      priority: 80,
    },
    {
      name: "Notify on high-value customer creation",
      description: "Creates a proposal when a customer with annual revenue > 1M is created",
      entityTypeSlug: "customer",
      triggerOn: "mutation",
      conditions: JSON.stringify([{ field: "annual_revenue", operator: "gt", value: "1000000" }]),
      actionType: "create_proposal",
      priority: 90,
    },
    {
      name: "Auto-flag churned customers",
      description: "Flags customers for review when their status changes to churned",
      entityTypeSlug: "customer",
      triggerOn: "mutation",
      conditions: JSON.stringify([{ field: "status", operator: "equals", value: "churned" }]),
      actionType: "flag_for_review",
      priority: 70,
    },
  ];

  for (const ar of actionRules) {
    await prisma.actionRule.create({
      data: { operatorId, ...ar },
    });
  }
  console.log(`Created ${actionRules.length} action rules`);

  // ── Audit entries for demo ───────────────────────────────────

  const auditEntries = [
    { action: "create_entity", actorType: "operator", outcome: "success", entityTypeSlug: "customer" },
    { action: "create_entity", actorType: "system", outcome: "success", entityTypeSlug: "invoice" },
    { action: "update_entity", actorType: "operator", outcome: "success", entityTypeSlug: "customer" },
    { action: "create_relationship", actorType: "system", outcome: "success" },
    { action: "evaluate_policy", actorType: "system", outcome: "success" },
  ];

  for (const a of auditEntries) {
    await prisma.auditEntry.create({
      data: { operatorId, ...a },
    });
  }
  console.log("Created demo audit entries");
}
