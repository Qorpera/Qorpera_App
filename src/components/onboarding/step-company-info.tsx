"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Department } from "./types";

const INDUSTRY_OPTIONS = [
  { value: "", label: "Select industry (optional)" },
  { value: "Technology", label: "Technology" },
  { value: "Finance", label: "Finance" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Retail", label: "Retail" },
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Professional Services", label: "Professional Services" },
  { value: "Other", label: "Other" },
];

interface StepCompanyInfoProps {
  companyName: string;
  setCompanyName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  originalCompanyName: string;
  originalIndustry: string;
  onContinue: (departments: Department[]) => void;
}

export function StepCompanyInfo({
  companyName,
  setCompanyName,
  industry,
  setIndustry,
  originalCompanyName,
  originalIndustry,
  onContinue,
}: StepCompanyInfoProps) {
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!companyName.trim()) return;
    setSaving(true);

    try {
      const patchData: Record<string, string> = {};
      if (companyName.trim() !== originalCompanyName) {
        patchData.companyName = companyName.trim();
      }
      if (industry !== originalIndustry) {
        patchData.industry = industry;
      }

      if (Object.keys(patchData).length > 0) {
        await fetch("/api/operator", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchData),
        });
      }

      if (industry && industry !== originalIndustry) {
        await fetch("/api/orientation/advance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: JSON.stringify({ industry }) }),
        });
      }

      const res = await fetch("/api/departments");
      const data: Department[] = res.ok ? await res.json() : [];
      onContinue(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider">Step 1 of 6</p>
        <h1 className="text-2xl font-semibold text-white/90">What&apos;s your company called?</h1>
      </div>

      <div className="space-y-4">
        <Input
          label="Company name"
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          placeholder="Acme Corp"
          autoFocus
        />
        <Select
          label="What industry are you in?"
          options={INDUSTRY_OPTIONS}
          value={industry}
          onChange={e => setIndustry(e.target.value)}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          variant="primary"
          size="md"
          onClick={handleContinue}
          disabled={!companyName.trim() || saving}
        >
          {saving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
