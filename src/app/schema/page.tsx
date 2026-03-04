"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

interface Property {
  id: string;
  name: string;
  slug: string;
  dataType: string;
  required: boolean;
  filterable: boolean;
  displayOrder: number;
  identityRole: string | null;
  enumValues: string | null;
}

interface EntityType {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  properties: Property[];
  _count: { entities: number };
}

interface RelationshipType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  fromType: { id: string; name: string; slug: string };
  toType: { id: string; name: string; slug: string };
  _count: { relationships: number };
}

interface PropertyValue {
  property: { id: string; name: string; slug: string; dataType: string };
  value: string;
}

interface Entity {
  id: string;
  displayName: string;
  status: string;
  entityType: { id: string; name: string; slug: string; icon: string; color: string };
  propertyValues: PropertyValue[];
}

type Category = "entity-types" | "properties" | "relationships";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "entity-types", label: "Entity Types" },
  { id: "properties", label: "Properties" },
  { id: "relationships", label: "Relationships" },
];

const ICONS = [
  "\uD83D\uDCBC", "\uD83D\uDC64", "\uD83D\uDCE6", "\uD83D\uDCDD",
  "\uD83C\uDFE2", "\u2699\uFE0F", "\uD83D\uDCCA", "\uD83D\uDD11",
];
const COLORS = [
  "#a855f7", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];

const DATA_TYPES = [
  { value: "STRING", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Boolean" },
  { value: "ENUM", label: "Enum" },
  { value: "CURRENCY", label: "Currency" },
];

const IDENTITY_ROLES = [
  { value: "", label: "None" },
  { value: "email", label: "Email" },
  { value: "domain", label: "Domain" },
  { value: "phone", label: "Phone" },
];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function ManageModelsPage() {
  const [types, setTypes] = useState<EntityType[]>([]);
  const [relTypes, setRelTypes] = useState<RelationshipType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("entity-types");

  // Entity type state
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [showNewType, setShowNewType] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIcon, setNewIcon] = useState(ICONS[0]);
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Property form state
  const [showNewProp, setShowNewProp] = useState(false);
  const [propName, setPropName] = useState("");
  const [propDataType, setPropDataType] = useState("STRING");
  const [propRequired, setPropRequired] = useState(false);
  const [propFilterable, setPropFilterable] = useState(false);
  const [propIdentityRole, setPropIdentityRole] = useState("");
  const [propTypeId, setPropTypeId] = useState("");

  // Relationship form state
  const [showNewRel, setShowNewRel] = useState(false);
  const [relName, setRelName] = useState("");
  const [relFromTypeId, setRelFromTypeId] = useState("");
  const [relToTypeId, setRelToTypeId] = useState("");
  const [relDescription, setRelDescription] = useState("");

  // Properties filter
  const [propFilterType, setPropFilterType] = useState("");

  // Inline entity form state (per expanded type)
  const [addingEntityForTypeId, setAddingEntityForTypeId] = useState<string | null>(null);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityProps, setNewEntityProps] = useState<Record<string, string>>({});

  // Inline entities list per expanded type
  const [typeEntities, setTypeEntities] = useState<Entity[]>([]);
  const [typeEntitiesLoading, setTypeEntitiesLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [typesRes, relRes] = await Promise.all([
        fetch("/api/entity-types"),
        fetch("/api/relationship-types"),
      ]);
      if (!typesRes.ok) throw new Error(`HTTP ${typesRes.status}`);
      setTypes(await typesRes.json());
      if (relRes.ok) setRelTypes(await relRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch entities for an expanded type
  const fetchTypeEntities = useCallback(async (typeSlug: string) => {
    setTypeEntitiesLoading(true);
    try {
      const res = await fetch(`/api/entities?type=${typeSlug}&limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTypeEntities(data.entities);
    } catch {
      setTypeEntities([]);
    } finally {
      setTypeEntitiesLoading(false);
    }
  }, []);

  // Load entities when a type is expanded
  useEffect(() => {
    if (expandedTypeId) {
      const type = types.find((t) => t.id === expandedTypeId);
      if (type) fetchTypeEntities(type.slug);
    } else {
      setTypeEntities([]);
    }
  }, [expandedTypeId, types, fetchTypeEntities]);

  // ── Entity Type handlers ──

  const handleCreateType = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/entity-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          slug: slugify(newName),
          description: newDescription.trim(),
          icon: newIcon,
          color: newColor,
          properties: [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowNewType(false);
      setNewName("");
      setNewDescription("");
      fetchData();
    } catch {
      // Handled silently
    } finally {
      setSaving(false);
    }
  };

  // ── Property handlers ──

  const handleAddProperty = async (typeId: string) => {
    if (!propName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/entity-types/${typeId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: propName.trim(),
          slug: slugify(propName),
          dataType: propDataType,
          required: propRequired,
          filterable: propFilterable,
          identityRole: propIdentityRole || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resetPropForm();
      fetchData();
    } catch {
      // Handled silently
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProperty = async (typeId: string, propertyId: string) => {
    try {
      await fetch(`/api/entity-types/${typeId}/properties`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      fetchData();
    } catch {
      // Handled silently
    }
  };

  const resetPropForm = () => {
    setShowNewProp(false);
    setPropName("");
    setPropDataType("STRING");
    setPropRequired(false);
    setPropFilterable(false);
    setPropIdentityRole("");
    setPropTypeId("");
  };

  // ── Relationship handlers ──

  const handleCreateRelationship = async () => {
    if (!relName.trim() || !relFromTypeId || !relToTypeId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/relationship-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: relName.trim(),
          slug: slugify(relName),
          fromEntityTypeId: relFromTypeId,
          toEntityTypeId: relToTypeId,
          description: relDescription.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowNewRel(false);
      setRelName("");
      setRelFromTypeId("");
      setRelToTypeId("");
      setRelDescription("");
      fetchData();
    } catch {
      // Handled silently
    } finally {
      setSaving(false);
    }
  };

  // ── Inline entity handlers ──

  const handleCreateEntity = async (typeId: string) => {
    if (!newEntityName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityTypeId: typeId,
          displayName: newEntityName.trim(),
          properties: newEntityProps,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAddingEntityForTypeId(null);
      setNewEntityName("");
      setNewEntityProps({});
      fetchData();
      const type = types.find((t) => t.id === typeId);
      if (type) fetchTypeEntities(type.slug);
    } catch {
      // Handled silently
    } finally {
      setSaving(false);
    }
  };

  // ── Derived data ──

  const typeOptions = types.map((t) => ({ value: t.id, label: t.name }));
  const typeFilterOptions = [{ value: "", label: "All types" }, ...typeOptions];

  const allProperties = types.flatMap((t) =>
    t.properties.map((p) => ({ ...p, typeName: t.name, typeSlug: t.slug, typeId: t.id, typeColor: t.color }))
  );
  const filteredProperties = propFilterType
    ? allProperties.filter((p) => p.typeId === propFilterType)
    : allProperties;

  const totalProperties = allProperties.length;

  // ── Actions per category ──

  const categoryActions: Record<Category, { label: string; onClick: () => void } | null> = {
    "entity-types": { label: "New Type", onClick: () => setShowNewType(true) },
    properties: {
      label: "Add Property",
      onClick: () => {
        setPropTypeId(types[0]?.id || "");
        setShowNewProp(true);
      },
    },
    relationships: { label: "New Relationship", onClick: () => setShowNewRel(true) },
  };

  const action = categoryActions[category];

  return (
    <AppShell>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white/90">Manage Models</h1>
          {action && (
            <Button variant="primary" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>

        {/* Category sub-navigation */}
        <div className="flex items-center gap-1 border-b border-white/[0.06] -mx-8 px-8">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            const count =
              cat.id === "entity-types"
                ? types.length
                : cat.id === "properties"
                  ? totalProperties
                  : relTypes.length;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`relative px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "text-purple-300"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                <span className="flex items-center gap-2">
                  {cat.label}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      active
                        ? "bg-purple-500/15 text-purple-300"
                        : "bg-white/5 text-white/30"
                    }`}
                  >
                    {count}
                  </span>
                </span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-t" />
                )}
              </button>
            );
          })}
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

        {/* ═══════════ ENTITY TYPES ═══════════ */}
        {!loading && !error && category === "entity-types" && (
          <div className="space-y-3">
            {types.length === 0 && (
              <div className="wf-soft p-10 text-center">
                <p className="text-sm text-white/40">
                  No entity types defined yet. Create one to get started.
                </p>
              </div>
            )}
            {types.map((type) => {
              const isExpanded = expandedTypeId === type.id;
              const isAddingEntity = addingEntityForTypeId === type.id;
              return (
                <div key={type.id} className="wf-soft">
                  <button
                    onClick={() =>
                      setExpandedTypeId(isExpanded ? null : type.id)
                    }
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span
                      className="text-2xl w-9 h-9 flex items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${type.color}15` }}
                    >
                      {type.icon || "\u25CF"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/90">
                        {type.name}
                      </div>
                      <div className="text-xs text-white/40">
                        {type.slug}
                        {type.description && ` \u2014 ${type.description}`}
                      </div>
                    </div>
                    <Badge variant="default">
                      {type.properties.length} props
                    </Badge>
                    <Badge variant="purple">
                      {type._count.entities} entities
                    </Badge>
                    <svg
                      className={`w-4 h-4 text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </button>

                  {/* Expanded: properties + entities */}
                  {isExpanded && (
                    <div className="border-t border-white/[0.06]">
                      {/* ── Properties section ── */}
                      <div className="px-5 py-4 space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25">Properties</p>
                        {type.properties.length === 0 && (
                          <p className="text-xs text-white/30">
                            No properties defined.
                          </p>
                        )}
                        {type.properties.map((prop) => (
                          <div
                            key={prop.id}
                            className="flex items-center gap-3 text-sm"
                          >
                            <span className="text-white/70 flex-1">
                              {prop.name}
                            </span>
                            <Badge variant="default">{prop.dataType}</Badge>
                            {prop.required && (
                              <Badge variant="amber">Required</Badge>
                            )}
                            {prop.filterable && (
                              <Badge variant="blue">Filterable</Badge>
                            )}
                            {prop.identityRole && (
                              <Badge variant="green">{prop.identityRole}</Badge>
                            )}
                            <button
                              onClick={() =>
                                handleDeleteProperty(type.id, prop.id)
                              }
                              className="text-white/20 hover:text-red-400 transition-colors"
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
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}

                        <button
                          onClick={() => {
                            setPropTypeId(type.id);
                            setPropName("");
                            setShowNewProp(true);
                          }}
                          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          + Add property
                        </button>
                      </div>

                      {/* ── Entities section ── */}
                      <div className="border-t border-white/[0.06] px-5 py-4 space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25">Entities</p>

                        {typeEntitiesLoading && (
                          <div className="flex justify-center py-3">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
                          </div>
                        )}

                        {!typeEntitiesLoading && typeEntities.length === 0 && (
                          <p className="text-xs text-white/30">
                            No entities yet.
                          </p>
                        )}

                        {!typeEntitiesLoading && typeEntities.map((entity) => (
                          <div
                            key={entity.id}
                            className="flex items-center gap-3 text-sm"
                          >
                            <span className="text-white/70 flex-1 truncate">
                              {entity.displayName}
                            </span>
                            {entity.propertyValues.slice(0, 2).map((pv) => (
                              <span key={pv.property.id} className="text-xs text-white/35 shrink-0">
                                {pv.value}
                              </span>
                            ))}
                            <Badge variant={entity.status === "active" ? "green" : "default"}>
                              {entity.status}
                            </Badge>
                          </div>
                        ))}

                        {/* Inline add entity form */}
                        {isAddingEntity ? (
                          <div className="space-y-3 pt-2 border-t border-white/[0.04]">
                            <Input
                              label="Display Name"
                              value={newEntityName}
                              onChange={(e) => setNewEntityName(e.target.value)}
                              placeholder="e.g. Acme Corp, John Smith, INV-001"
                            />
                            {type.properties.map((prop) => (
                              <Input
                                key={prop.id}
                                label={`${prop.name}${prop.required ? " *" : ""}`}
                                value={newEntityProps[prop.slug] || ""}
                                onChange={(e) =>
                                  setNewEntityProps((prev) => ({
                                    ...prev,
                                    [prop.slug]: e.target.value,
                                  }))
                                }
                                placeholder={
                                  prop.dataType === "BOOLEAN"
                                    ? "true / false"
                                    : prop.dataType === "DATE"
                                      ? "YYYY-MM-DD"
                                      : prop.dataType === "CURRENCY" || prop.dataType === "NUMBER"
                                        ? "0"
                                        : ""
                                }
                              />
                            ))}
                            <div className="flex items-center gap-3">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleCreateEntity(type.id)}
                                disabled={saving || !newEntityName.trim()}
                              >
                                {saving ? "Creating..." : "Create"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAddingEntityForTypeId(null);
                                  setNewEntityName("");
                                  setNewEntityProps({});
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingEntityForTypeId(type.id);
                              setNewEntityName("");
                              setNewEntityProps({});
                            }}
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                          >
                            + Add entity
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════════ PROPERTIES ═══════════ */}
        {!loading && !error && category === "properties" && (
          <div className="space-y-4">
            {/* Filter by type */}
            <div className="w-48">
              <Select
                label="Filter by type"
                options={typeFilterOptions}
                value={propFilterType}
                onChange={(e) => setPropFilterType(e.target.value)}
              />
            </div>

            {filteredProperties.length === 0 ? (
              <div className="wf-soft p-10 text-center">
                <p className="text-sm text-white/40">
                  {propFilterType
                    ? "No properties for this type."
                    : "No properties defined yet."}
                </p>
              </div>
            ) : (
              <div className="wf-soft overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                        Property
                      </th>
                      <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                        Entity Type
                      </th>
                      <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                        Data Type
                      </th>
                      <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                        Flags
                      </th>
                      <th className="text-right px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider w-10">
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredProperties.map((prop) => (
                      <tr
                        key={`${prop.typeId}-${prop.id}`}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="text-white/80">{prop.name}</div>
                          <div className="text-xs text-white/30">{prop.slug}</div>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border"
                            style={{
                              borderColor: `${prop.typeColor}30`,
                              color: prop.typeColor,
                            }}
                          >
                            {prop.typeName}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant="default">{prop.dataType}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {prop.required && (
                              <Badge variant="amber">Required</Badge>
                            )}
                            {prop.filterable && (
                              <Badge variant="blue">Filterable</Badge>
                            )}
                            {prop.identityRole && (
                              <Badge variant="green">{prop.identityRole}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() =>
                              handleDeleteProperty(prop.typeId, prop.id)
                            }
                            className="text-white/15 hover:text-red-400 transition-colors"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ RELATIONSHIPS ═══════════ */}
        {!loading && !error && category === "relationships" && (
          <div className="space-y-3">
            {relTypes.length === 0 ? (
              <div className="wf-soft p-10 text-center">
                <p className="text-sm text-white/40">
                  No relationship types defined yet.
                </p>
              </div>
            ) : (
              relTypes.map((rt) => (
                <div
                  key={rt.id}
                  className="wf-soft px-5 py-4 flex items-center gap-4"
                >
                  <svg
                    className="w-5 h-5 text-white/20 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/90">
                      {rt.name}
                    </div>
                    <div className="text-xs text-white/40 flex items-center gap-1.5 mt-0.5">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border"
                        style={{
                          borderColor: `${types.find((t) => t.id === rt.fromType.id)?.color || "#fff"}30`,
                          color: types.find((t) => t.id === rt.fromType.id)?.color || "#fff",
                        }}
                      >
                        {rt.fromType.name}
                      </span>
                      <span className="text-white/20">&rarr;</span>
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border"
                        style={{
                          borderColor: `${types.find((t) => t.id === rt.toType.id)?.color || "#fff"}30`,
                          color: types.find((t) => t.id === rt.toType.id)?.color || "#fff",
                        }}
                      >
                        {rt.toType.name}
                      </span>
                    </div>
                    {rt.description && (
                      <div className="text-xs text-white/30 mt-1">
                        {rt.description}
                      </div>
                    )}
                  </div>
                  <Badge variant="default">
                    {rt._count.relationships} instances
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}

        {/* ═══════════ MODALS ═══════════ */}

        {/* New Entity Type */}
        <Modal
          open={showNewType}
          onClose={() => setShowNewType(false)}
          title="New Entity Type"
        >
          <div className="space-y-5">
            <Input
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Customers, Invoices, Products"
            />
            {newName && (
              <div className="text-xs text-white/30">
                Slug: <span className="text-white/50">{slugify(newName)}</span>
              </div>
            )}
            <Input
              label="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="What does this entity represent?"
            />
            <div>
              <label className="text-sm text-white/60 font-medium mb-2 block">
                Icon
              </label>
              <div className="flex gap-2">
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setNewIcon(icon)}
                    className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition ${
                      newIcon === icon
                        ? "bg-purple-500/20 border border-purple-500/40"
                        : "bg-white/5 border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-white/60 font-medium mb-2 block">
                Color
              </label>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-8 h-8 rounded-full transition ${
                      newColor === color
                        ? "ring-2 ring-white/60 ring-offset-2 ring-offset-[#182027]"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowNewType(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateType}
                disabled={saving || !newName.trim()}
              >
                {saving ? "Creating..." : "Create Type"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* New Property */}
        <Modal
          open={showNewProp}
          onClose={() => resetPropForm()}
          title="Add Property"
        >
          <div className="space-y-4">
            <Select
              label="Entity Type"
              options={typeOptions}
              value={propTypeId}
              onChange={(e) => setPropTypeId(e.target.value)}
            />
            <Input
              label="Name"
              value={propName}
              onChange={(e) => setPropName(e.target.value)}
              placeholder="e.g. Email, Status, Amount"
            />
            {propName && (
              <div className="text-xs text-white/30">
                Slug: <span className="text-white/50">{slugify(propName)}</span>
              </div>
            )}
            <Select
              label="Data Type"
              options={DATA_TYPES}
              value={propDataType}
              onChange={(e) => setPropDataType(e.target.value)}
            />
            <Select
              label="Identity Role"
              options={IDENTITY_ROLES}
              value={propIdentityRole}
              onChange={(e) => setPropIdentityRole(e.target.value)}
            />
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={propRequired}
                  onChange={(e) => setPropRequired(e.target.checked)}
                  className="rounded border-white/20"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={propFilterable}
                  onChange={(e) => setPropFilterable(e.target.checked)}
                  className="rounded border-white/20"
                />
                Filterable
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => resetPropForm()}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleAddProperty(propTypeId)}
                disabled={saving || !propName.trim() || !propTypeId}
              >
                {saving ? "Adding..." : "Add Property"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* New Relationship */}
        <Modal
          open={showNewRel}
          onClose={() => setShowNewRel(false)}
          title="New Relationship Type"
        >
          <div className="space-y-4">
            <Input
              label="Name"
              value={relName}
              onChange={(e) => setRelName(e.target.value)}
              placeholder="e.g. Owns, Manages, Belongs To"
            />
            {relName && (
              <div className="text-xs text-white/30">
                Slug: <span className="text-white/50">{slugify(relName)}</span>
              </div>
            )}
            <Select
              label="From Entity Type"
              options={[{ value: "", label: "Select..." }, ...typeOptions]}
              value={relFromTypeId}
              onChange={(e) => setRelFromTypeId(e.target.value)}
            />
            <Select
              label="To Entity Type"
              options={[{ value: "", label: "Select..." }, ...typeOptions]}
              value={relToTypeId}
              onChange={(e) => setRelToTypeId(e.target.value)}
            />
            <Input
              label="Description"
              value={relDescription}
              onChange={(e) => setRelDescription(e.target.value)}
              placeholder="Optional description"
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowNewRel(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateRelationship}
                disabled={saving || !relName.trim() || !relFromTypeId || !relToTypeId}
              >
                {saving ? "Creating..." : "Create Relationship"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
