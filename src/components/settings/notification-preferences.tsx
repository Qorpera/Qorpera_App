"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-api";

const TYPE_LABELS: Record<string, string> = {
  situation_proposed: "Situation Proposed",
  situation_resolved: "Situation Resolved",
  initiative_proposed: "Initiative Proposed",
  step_ready: "Step Ready",
  delegation_received: "Delegation Received",
  follow_up_triggered: "Follow-up Triggered",
  plan_auto_executed: "Plan Auto-Executed",
  plan_failed: "Plan Failed",
  peer_signal: "Peer Signal",
  insight_discovered: "Insight Discovered",
  system_alert: "System Alert",
};

const CHANNEL_OPTIONS = [
  { value: "both", label: "In-app + Email" },
  { value: "in_app", label: "In-app only" },
  { value: "email", label: "Email only" },
  { value: "none", label: "Off" },
];

type Preference = {
  type: string;
  channel: string;
  isDefault: boolean;
};

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [savingDigest, setSavingDigest] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetchApi("/api/notification-preferences");
      if (!res.ok) return;
      const data = await res.json();
      setPreferences(data.preferences ?? []);
      setDigestEnabled(data.digestEnabled ?? false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleChannelChange = async (type: string, channel: string) => {
    // Optimistic update
    setPreferences((prev) =>
      prev.map((p) => (p.type === type ? { ...p, channel, isDefault: false } : p))
    );
    setSavingType(type);
    try {
      const res = await fetchApi("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: [{ type, channel }] }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences ?? []);
      }
    } catch {
      // revert on error
      loadPreferences();
    } finally {
      setSavingType(null);
    }
  };

  const handleDigestToggle = async () => {
    const newValue = !digestEnabled;
    setDigestEnabled(newValue);
    setSavingDigest(true);
    try {
      const res = await fetchApi("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestEnabled: newValue }),
      });
      if (res.ok) {
        const data = await res.json();
        setDigestEnabled(data.digestEnabled ?? false);
      }
    } catch {
      setDigestEnabled(!newValue);
    } finally {
      setSavingDigest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Digest toggle */}
      <div
        style={{
          background: "#161616",
          border: "1px solid #2a2a2a",
          borderRadius: 6,
          padding: 20,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "#484848",
            textTransform: "uppercase" as const,
          }}
          className="mb-4"
        >
          Digest
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: 13, color: "#b0b0b0" }}>
              Email digest
            </div>
            <div style={{ fontSize: 11, color: "#484848" }}>
              Receive a periodic summary of notifications instead of individual emails
            </div>
          </div>
          <button
            onClick={handleDigestToggle}
            disabled={savingDigest}
            style={{
              position: "relative",
              display: "inline-flex",
              height: 24,
              width: 40,
              alignItems: "center",
              borderRadius: 12,
              background: digestEnabled ? "#a855f7" : "#222",
              transition: "background 150ms",
              opacity: savingDigest ? 0.5 : 1,
            }}
          >
            <span
              style={{
                display: "inline-block",
                height: 16,
                width: 16,
                borderRadius: 8,
                background: "#fff",
                transition: "transform 150ms",
                transform: digestEnabled
                  ? "translateX(20px)"
                  : "translateX(4px)",
              }}
            />
          </button>
        </div>
      </div>

      {/* Per-type channel preferences */}
      <div
        style={{
          background: "#161616",
          border: "1px solid #2a2a2a",
          borderRadius: 6,
          padding: 20,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "#484848",
            textTransform: "uppercase" as const,
          }}
          className="mb-4"
        >
          Notification Channels
        </div>

        <div className="space-y-0">
          {/* Header row */}
          <div
            className="grid items-center pb-2 mb-2"
            style={{
              gridTemplateColumns: "1fr 180px",
              borderBottom: "1px solid #2a2a2a",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#484848",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Type
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#484848",
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Channel
            </div>
          </div>

          {/* Preference rows */}
          {preferences.map((pref) => (
            <div
              key={pref.type}
              className="grid items-center py-2"
              style={{
                gridTemplateColumns: "1fr 180px",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "#b0b0b0" }}>
                  {TYPE_LABELS[pref.type] ?? pref.type}
                </div>
                {pref.isDefault && (
                  <div style={{ fontSize: 10, color: "#484848", marginTop: 1 }}>
                    Using default
                  </div>
                )}
              </div>
              <div className="relative">
                <select
                  value={pref.channel}
                  onChange={(e) =>
                    handleChannelChange(pref.type, e.target.value)
                  }
                  disabled={savingType === pref.type}
                  style={{
                    width: "100%",
                    padding: "5px 28px 5px 10px",
                    fontSize: 12,
                    color: savingType === pref.type ? "#484848" : "#b0b0b0",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid #2a2a2a",
                    borderRadius: 4,
                    outline: "none",
                    appearance: "none",
                    WebkitAppearance: "none",
                    cursor: savingType === pref.type ? "wait" : "pointer",
                  }}
                >
                  {CHANNEL_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      style={{ background: "#161616", color: "#b0b0b0" }}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                {/* Dropdown arrow */}
                <svg
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                  width="10"
                  height="6"
                  viewBox="0 0 10 6"
                  fill="none"
                >
                  <path
                    d="M1 1L5 5L9 1"
                    stroke="#484848"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
