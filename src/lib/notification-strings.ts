type NotificationTemplates = Record<string, (ctx: Record<string, string>) => { title: string; body: string }>;

export const notificationStrings: Record<string, NotificationTemplates> = {
  en: {
    situation_proposed: (ctx) => ({
      title: `New situation: ${ctx.name || "Review needed"}`,
      body: ctx.summary || "A new situation has been detected and needs your attention.",
    }),
    situation_resolved: (ctx) => ({
      title: `Situation resolved: ${ctx.name || ""}`,
      body: ctx.summary || "A situation has been resolved.",
    }),
    idea_proposed: (ctx) => ({
      title: `New idea: ${ctx.name || "Review needed"}`,
      body: ctx.summary || "A new idea has been proposed.",
    }),
    step_ready: (ctx) => ({
      title: `Step ready for review: ${ctx.name || ""}`,
      body: ctx.summary || "An execution step is ready for your review.",
    }),
    delegation_received: (ctx) => ({
      title: `${ctx.from || "AI"} delegated a task to you`,
      body: ctx.summary || "You have a new delegated task.",
    }),
    follow_up_triggered: (ctx) => ({
      title: `Follow-up triggered: ${ctx.name || ""}`,
      body: ctx.summary || "A follow-up condition has been met.",
    }),
    plan_auto_executed: (ctx) => ({
      title: `Plan auto-executed: ${ctx.name || ""}`,
      body: ctx.summary || "An execution plan was automatically completed.",
    }),
    plan_failed: (ctx) => ({
      title: `Plan failed: ${ctx.name || ""}`,
      body: ctx.summary || "An execution plan encountered an error.",
    }),
    peer_signal: (ctx) => ({
      title: `Cross-domain signal from ${ctx.domain || "another domain"}`,
      body: ctx.summary || "A signal was detected across domains.",
    }),
    insight_discovered: (ctx) => ({
      title: `New insight: ${ctx.name || ""}`,
      body: ctx.summary || "A new operational insight has been discovered.",
    }),
    system_alert: (ctx) => ({
      title: ctx.name || "System alert",
      body: ctx.summary || "A system alert requires your attention.",
    }),
    awareness_informational: (ctx) => ({
      title: ctx.title || "Awareness update",
      body: ctx.body || "",
    }),
  },
  da: {
    situation_proposed: (ctx) => ({
      title: `Ny situation: ${ctx.name || "Gennemgang nødvendig"}`,
      body: ctx.summary || "En ny situation er opdaget og kræver din opmærksomhed.",
    }),
    situation_resolved: (ctx) => ({
      title: `Situation løst: ${ctx.name || ""}`,
      body: ctx.summary || "En situation er blevet løst.",
    }),
    idea_proposed: (ctx) => ({
      title: `Ny idé: ${ctx.name || "Gennemgang nødvendig"}`,
      body: ctx.summary || "En ny idé er blevet foreslået.",
    }),
    step_ready: (ctx) => ({
      title: `Trin klar til gennemgang: ${ctx.name || ""}`,
      body: ctx.summary || "Et udførelsestrin er klar til din gennemgang.",
    }),
    delegation_received: (ctx) => ({
      title: `${ctx.from || "AI"} har delegeret en opgave til dig`,
      body: ctx.summary || "Du har en ny delegeret opgave.",
    }),
    follow_up_triggered: (ctx) => ({
      title: `Opfølgning udløst: ${ctx.name || ""}`,
      body: ctx.summary || "En opfølgningsbetingelse er opfyldt.",
    }),
    plan_auto_executed: (ctx) => ({
      title: `Plan auto-udført: ${ctx.name || ""}`,
      body: ctx.summary || "En udførelsesplan blev automatisk gennemført.",
    }),
    plan_failed: (ctx) => ({
      title: `Plan mislykkedes: ${ctx.name || ""}`,
      body: ctx.summary || "En udførelsesplan stødte på en fejl.",
    }),
    peer_signal: (ctx) => ({
      title: `Signal fra ${ctx.domain || "et andet domæne"}`,
      body: ctx.summary || "Et signal er opdaget på tværs af domæner.",
    }),
    insight_discovered: (ctx) => ({
      title: `Ny indsigt: ${ctx.name || ""}`,
      body: ctx.summary || "En ny operationel indsigt er opdaget.",
    }),
    system_alert: (ctx) => ({
      title: ctx.name || "Systemadvarsel",
      body: ctx.summary || "En systemadvarsel kræver din opmærksomhed.",
    }),
    awareness_informational: (ctx) => ({
      title: ctx.title || "Opdatering",
      body: ctx.body || "",
    }),
  },
};

export function getLocalizedNotification(
  locale: string,
  type: string,
  context: Record<string, string>,
): { title: string; body: string } {
  const templates = notificationStrings[locale] || notificationStrings.en;
  const template = templates[type];
  if (!template) {
    // Fallback to English, then to raw context
    const enTemplate = notificationStrings.en[type];
    if (enTemplate) return enTemplate(context);
    return { title: context.name || type, body: context.summary || "" };
  }
  return template(context);
}
