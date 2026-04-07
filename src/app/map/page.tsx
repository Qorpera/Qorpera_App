"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Domain {
  id: string;
  displayName: string;
  description: string | null;
  entityType: { slug: string };
  isHQ: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const POLL_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MapPage() {
  const router = useRouter();
  const t = useTranslations("map");
  const tc = useTranslations("common");

  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainStats, setDomainStats] = useState<Record<string, { situations: number; wikiPages: number }>>({});

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const loadDomains = useCallback(async () => {
    try {
      const res = await fetchApi("/api/domains");
      if (!res.ok) return;
      const data: Array<Omit<Domain, "isHQ"> & { entityType: { slug: string } }> = await res.json();
      const mapped = data.map((d) => ({ ...d, isHQ: d.entityType.slug === "organization" })) as Domain[];
      setDomains(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
    const iv = setInterval(loadDomains, POLL_MS);
    return () => clearInterval(iv);
  }, [loadDomains]);

  // Fetch domain stats (situation counts + wiki page counts)
  useEffect(() => {
    if (domains.length === 0) return;
    Promise.all([
      fetchApi("/api/situations?status=detected,proposed,reasoning,executing").then(r => r.ok ? r.json() : { items: [] }),
      fetchApi("/api/wiki").then(r => r.ok ? r.json() : { pages: [] }),
    ]).then(([sitData, wikiData]) => {
      const stats: Record<string, { situations: number; wikiPages: number }> = {};
      for (const dom of domains) {
        stats[dom.id] = { situations: 0, wikiPages: 0 };
      }
      for (const s of sitData.items ?? []) {
        if (s.domainName) {
          const dom = domains.find(d => d.displayName === s.domainName);
          if (dom && stats[dom.id]) stats[dom.id].situations++;
        }
      }
      for (const p of (wikiData.pages ?? [])) {
        const pageDomainIds = p.domainIds ?? p.domainIds ?? [];
        for (const did of pageDomainIds) {
          if (stats[did]) stats[did].wikiPages++;
        }
      }
      setDomainStats(stats);
    }).catch(() => {});
  }, [domains]);

  /* ---------------------------------------------------------------- */
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  const hq = domains.find(d => d.isHQ);
  const activeDomains = domains.filter(d => !d.isHQ);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-surface">
        {loading && (
          <p className="text-[var(--fg4)] text-sm text-center py-12">{tc("loading")}</p>
        )}

        {!loading && activeDomains.length === 0 && !hq && (
          <div className="text-center py-16">
            <p className="text-[var(--fg4)] text-sm">{t("emptyMapHint")}</p>
          </div>
        )}

        {!loading && (hq || activeDomains.length > 0) && (
          <div className="max-w-4xl mx-auto px-6 py-8">
            {/* Operator center card */}
            {hq && (
              <div className="flex justify-center mb-8">
                <button
                  onClick={() => router.push(`/map/${hq.id}`)}
                  className="rounded-lg px-8 py-5 bg-elevated hover:brightness-110 transition text-center"
                  style={{ border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                >
                  <div className="text-lg font-semibold text-foreground">{hq.displayName}</div>
                  <div className="text-sm text-[var(--fg3)] mt-1">
                    {activeDomains.length} {activeDomains.length === 1 ? "domain" : "domains"}
                  </div>
                </button>
              </div>
            )}

            {/* Connecting lines from center to domains */}
            {hq && activeDomains.length > 0 && (
              <div className="flex justify-center mb-4">
                <div className="w-px h-6 bg-border" />
              </div>
            )}

            {/* Domain cards — flat centered grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
              {activeDomains.map(dom => {
                const stats = domainStats[dom.id];
                return (
                  <button
                    key={dom.id}
                    onClick={() => router.push(`/map/${dom.id}`)}
                    className="w-full rounded-lg p-5 bg-elevated hover:brightness-110 transition text-left"
                    style={{ border: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                  >
                    <div className="text-base font-semibold text-foreground truncate">{dom.displayName}</div>
                    {dom.description && (
                      <div className="text-xs text-[var(--fg3)] mt-1 line-clamp-2">{dom.description}</div>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-[var(--fg4)]">
                      {(stats?.situations ?? 0) > 0 && (
                        <span>{stats!.situations} situation{stats!.situations !== 1 ? "s" : ""}</span>
                      )}
                      {(stats?.wikiPages ?? 0) > 0 && (
                        <span>{stats!.wikiPages} wiki page{stats!.wikiPages !== 1 ? "s" : ""}</span>
                      )}
                      {!stats?.situations && !stats?.wikiPages && (
                        <span className="text-[var(--fg5)]">No activity yet</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
