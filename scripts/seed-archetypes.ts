import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const ARCHETYPES = [
  // ── Payment & Financial ──
  {
    slug: "overdue_invoice",
    name: "Overdue Invoice",
    description: "A customer invoice is past its due date and payment has not been received. Requires follow-up to collect payment.",
    category: "payment_financial",
    defaultSeverity: "high",
    examplePhrases: [
      "Invoice INV-2026-035 is 15 days overdue",
      "Customer hasn't paid despite two reminders",
      "Payment for project phase 2 still outstanding",
      "Need to send payment reminder to client",
      "Overdue receivable from repeat late-payer"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about unpaid invoices, payment reminders, overdue receivables, or collection follow-ups"
    },
  },
  {
    slug: "payment_reconciliation",
    name: "Payment Reconciliation",
    description: "A payment has been received but cannot be matched to an invoice, or a discrepancy exists between expected and received amounts.",
    category: "payment_financial",
    defaultSeverity: "medium",
    examplePhrases: [
      "Payment received but doesn't match any open invoice",
      "Client paid DKK 45,000 but invoice was DKK 47,500",
      "Bank transfer with no reference number",
      "Double payment detected from customer",
      "Partial payment received, need to update ledger"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about payment mismatches, unidentified payments, partial payments, or reconciliation issues"
    },
  },
  {
    slug: "budget_variance",
    name: "Budget Variance",
    description: "Actual spending or revenue is significantly above or below the planned budget for a project, department, or period.",
    category: "payment_financial",
    defaultSeverity: "medium",
    examplePhrases: [
      "Project costs 30% over budget",
      "Material costs exceeding estimate",
      "Revenue tracking below Q1 target",
      "Unexpected expense on project site",
      "Need to review budget allocation"
    ],
    detectionTemplate: {
      mode: "natural",
      naturalLanguage: "Spending or revenue patterns that deviate significantly from planned budgets, requiring review or adjustment of financial plans."
    },
  },
  {
    slug: "cash_flow_alert",
    name: "Cash Flow Alert",
    description: "The company's cash position is at risk — outstanding receivables, delayed payments, or upcoming expenses threaten liquidity.",
    category: "payment_financial",
    defaultSeverity: "high",
    examplePhrases: [
      "Can't pay vendor until client pays us",
      "Material purchases delayed due to cash flow",
      "Multiple overdue invoices creating liquidity risk",
      "Need to collect before we can order supplies",
      "Payroll coming up but receivables still outstanding"
    ],
    detectionTemplate: {
      mode: "natural",
      naturalLanguage: "Outstanding receivables from multiple clients creating liquidity risk that could delay vendor payments, material purchases, or project delivery."
    },
  },
  {
    slug: "expense_approval",
    name: "Expense Approval",
    description: "An expense, purchase order, or cost commitment requires review and authorization before proceeding.",
    category: "payment_financial",
    defaultSeverity: "low",
    examplePhrases: [
      "Purchase order needs manager approval",
      "Travel expense submitted for review",
      "Material order exceeds approval threshold",
      "New subscription requires authorization",
      "Contractor invoice needs sign-off"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages requesting approval for expenses, purchases, or cost commitments"
    },
  },

  // ── Sales & Pipeline ──
  {
    slug: "deal_stagnation",
    name: "Deal Stagnation",
    description: "An open sales deal or opportunity has had no activity (no emails, meetings, or status changes) beyond the expected threshold.",
    category: "sales_pipeline",
    defaultSeverity: "medium",
    examplePhrases: [
      "No contact with prospect in 3 weeks",
      "Quote sent but no follow-up scheduled",
      "Deal stuck in proposal stage for a month",
      "Client went quiet after site visit",
      "Need to re-engage stalled opportunity"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages indicating stalled deals, unresponsive prospects, or follow-ups needed on quotes and proposals"
    },
  },
  {
    slug: "contract_renewal",
    name: "Contract Renewal",
    description: "A service contract, maintenance agreement, license, or authorization is approaching its expiry date and requires renewal action.",
    category: "sales_pipeline",
    defaultSeverity: "high",
    examplePhrases: [
      "Service agreement expires in 60 days",
      "Authorization renewal deadline approaching",
      "License needs renewal before end of quarter",
      "Maintenance contract up for renegotiation",
      "Certification expiring — renewal docs needed"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about expiring contracts, licenses, certifications, authorizations, or agreements requiring renewal"
    },
  },
  {
    slug: "lead_follow_up",
    name: "Lead Follow-Up",
    description: "An inbound lead, inquiry, or request for quote has been received but not yet responded to within the expected timeframe.",
    category: "sales_pipeline",
    defaultSeverity: "high",
    examplePhrases: [
      "New customer inquiry received yesterday, no response yet",
      "Quote request from potential client",
      "Website form submission needs follow-up",
      "Referral from existing client waiting for contact",
      "Prospect asked for a site visit estimate"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages containing new business inquiries, quote requests, or leads requiring timely response"
    },
  },
  {
    slug: "upsell_opportunity",
    name: "Upsell Opportunity",
    description: "An existing customer is showing signals of expansion potential — additional needs, growing usage, or explicit interest in new services.",
    category: "sales_pipeline",
    defaultSeverity: "low",
    examplePhrases: [
      "Client asks about additional services",
      "Customer mentions upcoming renovation project",
      "Existing client expanding to new location",
      "Client satisfied, asking about solar installation",
      "Repeat customer with increasing order volume"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages from existing customers expressing interest in additional services, new projects, or expanded scope"
    },
  },
  {
    slug: "pipeline_risk",
    name: "Pipeline Risk",
    description: "The sales pipeline value or deal count is below target for the current period, threatening revenue goals.",
    category: "sales_pipeline",
    defaultSeverity: "medium",
    examplePhrases: [
      "Pipeline below quarterly target",
      "Not enough deals to hit revenue goal",
      "Two major deals fell through this month",
      "Need more proposals out to meet target",
      "Conversion rate dropping"
    ],
    detectionTemplate: {
      mode: "natural",
      naturalLanguage: "Sales pipeline indicators suggesting the company may miss revenue targets for the current period."
    },
  },

  // ── Client & Communication ──
  {
    slug: "client_escalation",
    name: "Client Escalation",
    description: "A customer is expressing dissatisfaction, frustration, urgency, or threatening to escalate an issue or end the relationship.",
    category: "client_communication",
    defaultSeverity: "high",
    examplePhrases: [
      "Client complains about repeated delays",
      "Customer threatening to find another vendor",
      "Angry email about quality of work",
      "Client demands immediate resolution",
      "Complaint about missed deadline"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages expressing customer dissatisfaction, complaints, frustration, urgency, or threats to escalate or terminate the relationship"
    },
  },
  {
    slug: "response_overdue",
    name: "Response Overdue",
    description: "An inbound communication (email, message) from a client, partner, or authority is awaiting a reply past the expected response time.",
    category: "client_communication",
    defaultSeverity: "medium",
    examplePhrases: [
      "Client email from 3 days ago still unanswered",
      "Vendor waiting for our confirmation",
      "Authority request pending response",
      "Partner asked for update last week",
      "Customer follow-up with no reply"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages that are clearly awaiting a response that has not been sent"
    },
  },
  {
    slug: "relationship_cooling",
    name: "Relationship Cooling",
    description: "Communication frequency with a key client, partner, or contact is declining significantly compared to historical patterns.",
    category: "client_communication",
    defaultSeverity: "medium",
    examplePhrases: [
      "Haven't heard from major client in a month",
      "Meeting cadence with partner dropped off",
      "Key contact stopped responding",
      "Regular check-in meetings cancelled",
      "Client engagement declining"
    ],
    detectionTemplate: {
      mode: "natural",
      naturalLanguage: "Communication frequency with key external contacts declining significantly compared to historical baseline, suggesting relationship deterioration."
    },
  },
  {
    slug: "meeting_follow_up",
    name: "Meeting Follow-Up",
    description: "Action items or commitments from a meeting have not been addressed within the expected timeframe.",
    category: "client_communication",
    defaultSeverity: "medium",
    examplePhrases: [
      "Meeting notes list 3 action items, none completed",
      "Promised to send proposal after meeting, haven't yet",
      "Follow-up email after site visit not sent",
      "Agreed to schedule next meeting, not done",
      "Minutes reference deliverable due this week"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages referencing unfinished action items, pending deliverables, or commitments from recent meetings"
    },
  },
  {
    slug: "communication_gap",
    name: "Communication Gap",
    description: "Expected regular communication (status updates, check-ins, reports) is missing or overdue.",
    category: "client_communication",
    defaultSeverity: "low",
    examplePhrases: [
      "Weekly status report not submitted",
      "Monthly client check-in overdue",
      "Project update not sent to stakeholders",
      "Regular team sync hasn't happened",
      "Progress report expected but not received"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Situations where expected regular communications (reports, check-ins, updates) are missing or late"
    },
  },

  // ── People & HR ──
  {
    slug: "onboarding_task",
    name: "Onboarding Task",
    description: "A new employee, apprentice, or contractor has a pending onboarding action item — training, equipment, access, or documentation.",
    category: "people_hr",
    defaultSeverity: "medium",
    examplePhrases: [
      "New apprentice needs safety training",
      "Employee needs system access set up",
      "New hire equipment not ordered",
      "Onboarding checklist items pending",
      "New team member needs mentor assignment"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about onboarding tasks, new employee setup, training assignments, or equipment provisioning for new hires"
    },
  },
  {
    slug: "workload_imbalance",
    name: "Workload Imbalance",
    description: "Work distribution across team members is significantly uneven — some overloaded, others underutilized.",
    category: "people_hr",
    defaultSeverity: "medium",
    examplePhrases: [
      "One person handling all client emails",
      "Team lead doing everyone's work",
      "Some technicians idle while others overbooked",
      "Uneven project allocation",
      "Key person drowning in tasks"
    ],
    detectionTemplate: {
      mode: "natural",
      naturalLanguage: "Activity patterns showing significantly uneven workload distribution across team members, with some overloaded and others underutilized."
    },
  },
  {
    slug: "employee_concern",
    name: "Employee Concern",
    description: "An employee is raising a concern, requesting help, or showing signs of difficulty — training needs, process confusion, or workplace issues.",
    category: "people_hr",
    defaultSeverity: "medium",
    examplePhrases: [
      "Apprentice asking for help with technical question",
      "Employee confused about procedures",
      "Team member requesting additional training",
      "Staff raising safety concern",
      "Worker reporting equipment issues"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages from employees raising concerns, asking questions about procedures, requesting help or training, or reporting workplace issues"
    },
  },
  {
    slug: "team_coordination",
    name: "Team Coordination",
    description: "A scheduling, resource, or coordination task between team members requires action — booking, assignments, shift changes.",
    category: "people_hr",
    defaultSeverity: "low",
    examplePhrases: [
      "Need to book technicians for next week",
      "Schedule conflict on project site",
      "Vehicle assignment needed for Tuesday",
      "Team member requesting day off",
      "Shift swap request"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about scheduling, resource allocation, team assignments, vehicle bookings, or coordination between team members"
    },
  },

  // ── Operations & Delivery ──
  {
    slug: "deadline_approaching",
    name: "Deadline Approaching",
    description: "A project deliverable, milestone, or commitment is due within the threshold period and requires attention to meet the deadline.",
    category: "operations_delivery",
    defaultSeverity: "high",
    examplePhrases: [
      "Project phase due next week",
      "Delivery deadline in 3 days",
      "Permit application deadline approaching",
      "Client expects completion by Friday",
      "Inspection scheduled, prep needed"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about approaching deadlines, due dates, delivery commitments, or time-sensitive milestones"
    },
  },
  {
    slug: "delivery_risk",
    name: "Delivery Risk",
    description: "A project or delivery is at risk of delay or quality issues — material delays, resource shortages, scope changes, or technical problems.",
    category: "operations_delivery",
    defaultSeverity: "high",
    examplePhrases: [
      "Material delivery delayed by supplier",
      "Can't start phase 3 without payment from client",
      "Weather delay on construction site",
      "Subcontractor unavailable for scheduled work",
      "Technical issue discovered during installation"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages indicating risks to project delivery — material delays, resource shortages, dependencies, technical problems, or scope changes"
    },
  },
  {
    slug: "compliance_deadline",
    name: "Compliance Deadline",
    description: "A regulatory, legal, or policy deadline requires action — license renewal, certification, filing, inspection, or audit preparation.",
    category: "operations_delivery",
    defaultSeverity: "high",
    examplePhrases: [
      "Electrical authorization expires in 60 days",
      "Annual safety inspection due",
      "Insurance documentation needs updating",
      "Regulatory filing deadline next month",
      "Certification renewal requires documentation"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages from regulatory authorities, about license/certification renewals, compliance deadlines, inspection schedules, or audit requirements"
    },
  },
  {
    slug: "process_bottleneck",
    name: "Process Bottleneck",
    description: "A workflow handoff is stalled, a queue is building up, or a process step is blocking downstream work.",
    category: "operations_delivery",
    defaultSeverity: "medium",
    examplePhrases: [
      "Waiting on approval to proceed",
      "Quote stuck in review for a week",
      "Material order pending manager sign-off",
      "Work blocked until inspection passes",
      "Multiple tasks waiting on same person"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages indicating stalled handoffs, blocked workflows, approval bottlenecks, or queues building up"
    },
  },
  {
    slug: "material_order",
    name: "Material Order",
    description: "Materials, supplies, or equipment need to be ordered, confirmed, or tracked for a project or operation.",
    category: "operations_delivery",
    defaultSeverity: "medium",
    examplePhrases: [
      "Need to order 200m cable for project",
      "LED panels not yet ordered for next week",
      "Supplier hasn't confirmed delivery date",
      "Material list needs pricing and ordering",
      "Equipment rental needs to be arranged"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about ordering materials, supplies, or equipment — purchase requests, supplier communications, delivery tracking"
    },
  },
  {
    slug: "urgent_dispatch",
    name: "Urgent Dispatch",
    description: "An emergency or urgent service request requires immediate response — sending a person, arranging a visit, or deploying resources now.",
    category: "operations_delivery",
    defaultSeverity: "high",
    examplePhrases: [
      "Customer reports power outage, need someone today",
      "Emergency callout requested",
      "Urgent repair needed on site",
      "Client needs immediate assistance",
      "Critical system failure, dispatch technician"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages requesting urgent or emergency service dispatch, immediate response, or same-day intervention"
    },
  },

  // ── Knowledge & Governance ──
  {
    slug: "decision_needed",
    name: "Decision Needed",
    description: "An explicit decision or choice is required — someone is asking for direction, authorization, or a judgment call.",
    category: "knowledge_governance",
    defaultSeverity: "medium",
    examplePhrases: [
      "Should we accept the lower offer?",
      "Need to decide on subcontractor",
      "Which approach should we take?",
      "Client asks for discount — approve?",
      "Two options for project timeline, need direction"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages containing explicit questions requiring a decision, authorization request, or request for direction"
    },
  },
  {
    slug: "knowledge_request",
    name: "Knowledge Request",
    description: "Someone is asking a technical, procedural, or domain-specific question that requires expertise to answer.",
    category: "knowledge_governance",
    defaultSeverity: "low",
    examplePhrases: [
      "When to use NOIKLX instead of NYM cable?",
      "What's the procedure for RCD testing?",
      "How do we handle warranty claims?",
      "What are the specifications for this installation?",
      "Need guidance on building code requirements"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages asking technical questions, requesting procedural guidance, or seeking expert knowledge"
    },
  },
  {
    slug: "document_action",
    name: "Document Action",
    description: "A document needs to be created, reviewed, signed, updated, or sent — quotes, contracts, reports, permits, or certificates.",
    category: "knowledge_governance",
    defaultSeverity: "medium",
    examplePhrases: [
      "Quote needs to be prepared and sent",
      "Contract ready for signature",
      "Report needs review before submission",
      "Updated documentation required for renewal",
      "Client requests formal project specification"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages about documents requiring creation, review, signature, update, or delivery"
    },
  },
  {
    slug: "access_request",
    name: "Access Request",
    description: "Someone needs access to a system, tool, location, or resource — account creation, permissions, keys, or credentials.",
    category: "knowledge_governance",
    defaultSeverity: "low",
    examplePhrases: [
      "New employee needs CRM access",
      "Request for building key",
      "Need login credentials for system",
      "Permission change requested",
      "Tool access for new team member"
    ],
    detectionTemplate: {
      mode: "content",
      description: "Emails or messages requesting access to systems, tools, locations, or resources"
    },
  },
];

async function main() {
  console.log("Seeding situation archetypes...");

  for (const archetype of ARCHETYPES) {
    await prisma.situationArchetype.upsert({
      where: { slug: archetype.slug },
      create: {
        slug: archetype.slug,
        name: archetype.name,
        description: archetype.description,
        category: archetype.category,
        defaultSeverity: archetype.defaultSeverity,
        examplePhrases: JSON.stringify(archetype.examplePhrases),
        detectionTemplate: JSON.stringify(archetype.detectionTemplate),
      },
      update: {
        name: archetype.name,
        description: archetype.description,
        category: archetype.category,
        defaultSeverity: archetype.defaultSeverity,
        examplePhrases: JSON.stringify(archetype.examplePhrases),
        detectionTemplate: JSON.stringify(archetype.detectionTemplate),
      },
    });
  }

  console.log(`Seeded ${ARCHETYPES.length} archetypes.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
