import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getOperatorId } from "@/lib/auth";
import { getEntity } from "@/lib/entity-model-store";
import { formatDateTime } from "@/lib/format";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const operatorId = await getOperatorId();

  const entity = await getEntity(operatorId, id);

  if (!entity) notFound();

  const outgoing = entity.fromRelations ?? [];
  const incoming = entity.toRelations ?? [];

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        {/* Back link */}
        <Link
          href="/entities"
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          Back to Entities
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4">
          <span className="text-3xl">
            {entity.entityType.icon || "\u25CF"}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white/90">
              {entity.displayName}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span
                className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border"
                style={{
                  borderColor: `${entity.entityType.color}40`,
                  backgroundColor: `${entity.entityType.color}15`,
                  color: entity.entityType.color,
                }}
              >
                {entity.entityType.name}
              </span>
              <span className="text-xs text-white/30">
                Created {formatDateTime(entity.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Properties table */}
        <section>
          <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-3">
            Properties
          </h2>
          {entity.propertyValues.length === 0 ? (
            <p className="text-sm text-white/30">No properties set.</p>
          ) : (
            <div className="wf-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                      Property
                    </th>
                    <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {entity.propertyValues.map((pv) => (
                    <tr key={pv.property.id}>
                      <td className="px-5 py-3 text-white/60">
                        {pv.property.name}
                      </td>
                      <td className="px-5 py-3 text-white/80">{pv.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Relationships */}
        {(outgoing.length > 0 || incoming.length > 0) && (
          <section>
            <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-3">
              Relationships
            </h2>
            <div className="space-y-4">
              {/* Outgoing */}
              {outgoing.length > 0 && (
                <div>
                  <h3 className="text-xs text-white/30 mb-2">
                    Outgoing ({outgoing.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {outgoing.map((rel) => (
                      <Link
                        key={rel.id}
                        href={`/entities/${rel.toEntity.id}`}
                        className="wf-soft px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
                      >
                        <span className="text-lg">
                          {rel.toEntity.entityType.icon || "\u25CF"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white/80 truncate">
                            {rel.toEntity.displayName}
                          </div>
                          <div className="text-[11px] text-white/40">
                            {rel.relationshipType.name}
                          </div>
                        </div>
                        <svg
                          className="w-4 h-4 text-white/20 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 4.5l7.5 7.5-7.5 7.5"
                          />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming */}
              {incoming.length > 0 && (
                <div>
                  <h3 className="text-xs text-white/30 mb-2">
                    Incoming ({incoming.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {incoming.map((rel) => (
                      <Link
                        key={rel.id}
                        href={`/entities/${rel.fromEntity.id}`}
                        className="wf-soft px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors"
                      >
                        <span className="text-lg">
                          {rel.fromEntity.entityType.icon || "\u25CF"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white/80 truncate">
                            {rel.fromEntity.displayName}
                          </div>
                          <div className="text-[11px] text-white/40">
                            {rel.relationshipType.name}
                          </div>
                        </div>
                        <svg
                          className="w-4 h-4 text-white/20 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 4.5l7.5 7.5-7.5 7.5"
                          />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* View in graph */}
        <div>
          <Link
            href="/entity-map"
            className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
            View in Entity Map
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
