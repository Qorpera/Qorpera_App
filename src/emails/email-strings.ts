type EmailStrings = {
  greeting: string;
  viewButton: string;
  footer: string;
  unsubscribe: string;
  subjects: Record<string, (props: Record<string, any>) => string>;
};

export const emailStrings: Record<string, EmailStrings> = {
  en: {
    greeting: "Hi",
    viewButton: "View in Qorpera",
    footer: "You received this because of your notification preferences.",
    unsubscribe: "Manage preferences",
    subjects: {
      situation_proposed: (p) => `[Qorpera] New situation: ${p.situationTitle || "Review needed"}`,
      situation_resolved: (p) => `[Qorpera] Resolved: ${p.situationTitle || "Situation resolved"}`,
      initiative_proposed: (p) => `[Qorpera] New initiative: ${p.initiativeTitle || "Review needed"}`,
      step_ready: (p) => `[Qorpera] Action needed: ${p.stepTitle || "Step ready"}`,
      delegation_received: (p) => `[Qorpera] New task: ${p.taskTitle || "Task assigned"}`,
      follow_up_triggered: (p) => `[Qorpera] Follow-up: ${p.followUpTitle || "Condition met"}`,
      plan_auto_executed: (p) => `[Qorpera] Auto-executed: ${p.planTitle || "Plan completed"}`,
      plan_failed: (p) => `[Qorpera] Plan failed: ${p.planTitle || "Execution error"}`,
      peer_signal: (p) => `[Qorpera] Signal from ${p.fromDepartment || "department"}`,
      insight_discovered: (p) => `[Qorpera] Insight: ${p.insightTitle || "New insight"}`,
      system_alert: (p) => `[Qorpera] ${p.severity === "critical" ? "CRITICAL: " : ""}${p.alertTitle || "System alert"}`,
      generic: () => "[Qorpera] Notification",
      invite: (p) => `[Qorpera] ${p.inviterName || "Someone"} invited you to join ${p.operatorName || "their team"}`,
      "password-reset": () => "[Qorpera] Reset your password",
      "email-verification": () => "[Qorpera] Verify your email address",
      digest: (p) => `[Qorpera] Your digest — ${p.periodStart || "recent activity"}`,
    },
  },
  da: {
    greeting: "Hej",
    viewButton: "Se i Qorpera",
    footer: "Du modtager denne email på grund af dine notifikationsindstillinger.",
    unsubscribe: "Administrer indstillinger",
    subjects: {
      situation_proposed: (p) => `[Qorpera] Ny situation: ${p.situationTitle || "Gennemgang nødvendig"}`,
      situation_resolved: (p) => `[Qorpera] Løst: ${p.situationTitle || "Situation løst"}`,
      initiative_proposed: (p) => `[Qorpera] Nyt initiativ: ${p.initiativeTitle || "Gennemgang nødvendig"}`,
      step_ready: (p) => `[Qorpera] Handling påkrævet: ${p.stepTitle || "Trin klar"}`,
      delegation_received: (p) => `[Qorpera] Ny opgave: ${p.taskTitle || "Opgave tildelt"}`,
      follow_up_triggered: (p) => `[Qorpera] Opfølgning: ${p.followUpTitle || "Betingelse opfyldt"}`,
      plan_auto_executed: (p) => `[Qorpera] Auto-udført: ${p.planTitle || "Plan afsluttet"}`,
      plan_failed: (p) => `[Qorpera] Plan mislykkedes: ${p.planTitle || "Udførelsesfejl"}`,
      peer_signal: (p) => `[Qorpera] Signal fra ${p.fromDepartment || "afdeling"}`,
      insight_discovered: (p) => `[Qorpera] Indsigt: ${p.insightTitle || "Ny indsigt"}`,
      system_alert: (p) => `[Qorpera] ${p.severity === "critical" ? "KRITISK: " : ""}${p.alertTitle || "Systemadvarsel"}`,
      generic: () => "[Qorpera] Notifikation",
      invite: (p) => `[Qorpera] ${p.inviterName || "Nogen"} har inviteret dig til ${p.operatorName || "deres team"}`,
      "password-reset": () => "[Qorpera] Nulstil din adgangskode",
      "email-verification": () => "[Qorpera] Bekræft din email-adresse",
      digest: (p) => `[Qorpera] Dit sammendrag — ${p.periodStart || "seneste aktivitet"}`,
    },
  },
};

export function getEmailStrings(locale: string): EmailStrings {
  return emailStrings[locale] || emailStrings.en;
}

export function getEmailSubject(locale: string, type: string, props: Record<string, any>): string {
  const strings = getEmailStrings(locale);
  const subjectFn = strings.subjects[type] || strings.subjects.generic;
  return subjectFn(props);
}
