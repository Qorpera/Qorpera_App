"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface EntityType {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface PropertyValue {
  property: { id: string; name: string; slug: string; dataType: string };
  value: string;
}

interface Entity {
  id: string;
  displayName: string;
  status: string;
  entityType: EntityType;
  propertyValues: PropertyValue[];
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch entity types
  useEffect(() => {
    fetch("/api/entity-types")
      .then((r) => r.json())
      .then((data) => setTypes(data))
      .catch(() => {});
  }, []);

  // Fetch entities
  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      if (searchDebounced) params.set("q", searchDebounced);
      const res = await fetch(`/api/entities?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntities(data.entities);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entities");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, searchDebounced]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  const typeOptions = [
    { value: "", label: "All types" },
    ...types.map((t) => ({ value: t.slug, label: t.name })),
  ];

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white/90">Entities</h1>
            {!loading && (
              <Badge variant="default">{total.toLocaleString()}</Badge>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-end gap-4">
          <div className="w-48">
            <Select
              label="Type"
              options={typeOptions}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Search"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-400 text-center py-8">{error}</div>
        )}

        {/* Empty state */}
        {!loading && !error && entities.length === 0 && (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">
              {searchDebounced || typeFilter
                ? "No entities match your filters."
                : "No entities yet. Import data or use the AI co-pilot to create entities."}
            </p>
          </div>
        )}

        {/* Entity grid */}
        {!loading && !error && entities.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {entities.map((entity) => (
              <div key={entity.id} className="wf-soft p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="purple"
                    className="shrink-0"
                  >
                    <span
                      className="mr-1"
                      style={{ color: entity.entityType.color }}
                    >
                      {entity.entityType.icon || "\u25CF"}
                    </span>
                    {entity.entityType.name}
                  </Badge>
                </div>
                <h3 className="text-sm font-medium text-white/90 truncate">
                  {entity.displayName}
                </h3>
                {/* First 3 properties */}
                <div className="space-y-1">
                  {entity.propertyValues.slice(0, 3).map((pv) => (
                    <div key={pv.property.id} className="text-xs">
                      <span className="text-white/40">{pv.property.name}:</span>{" "}
                      <span className="text-white/65">{pv.value}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/entities/${entity.id}`}
                  className="mt-auto text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  View details &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
