"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  required: boolean;
  placeholder?: string;
}

interface ConnectorConfigModalProps {
  providerId: string;
  providerName: string;
  fields: ConfigField[];
  onClose: () => void;
  onConnected: () => void;
}

export function ConnectorConfigModal({
  providerId,
  providerName,
  fields,
  onClose,
  onConnected,
}: ConnectorConfigModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRequiredFilled = fields
    .filter(f => f.required)
    .every(f => values[f.key]?.trim());

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          name: providerName,
          config: values,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Connection failed" }));
        setError(data.error || "Connection failed");
        return;
      }
      onConnected();
    } catch {
      setError("Failed to connect. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="wf-surface w-full max-w-md mx-4 p-6 rounded-xl space-y-4">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Connect {providerName}</h3>
          <p className="text-xs text-[var(--fg2)] mt-1">Enter your credentials to connect. The connection will be tested before saving.</p>
        </div>

        <div className="space-y-3">
          {fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-[var(--fg2)] mb-1">
                {field.label} {field.required && <span className="text-warn">*</span>}
              </label>
              <input
                type={field.type === "password" ? "password" : "text"}
                placeholder={field.placeholder}
                value={values[field.key] || ""}
                onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-hover text-sm text-foreground placeholder:text-[var(--fg3)] focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="text-sm text-[var(--fg2)] hover:text-foreground transition min-h-[44px] px-4"
          >
            Cancel
          </button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={loading || !allRequiredFilled}
            className="min-h-[44px]"
          >
            {loading ? "Testing connection..." : "Connect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
