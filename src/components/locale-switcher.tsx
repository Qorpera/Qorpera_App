"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  da: "Dansk",
};

export function LocaleSwitcher({ currentLocale = "en" }: { currentLocale?: string }) {
  const router = useRouter();
  const t = useTranslations("localeSwitcher");
  const [isPending, startTransition] = useTransition();
  const [locale, setLocale] = useState(currentLocale);

  const handleChange = async (newLocale: string) => {
    if (newLocale === locale) return;
    setLocale(newLocale);

    // Set cookie
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;

    // Persist to user model
    try {
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch {
      // Best-effort — cookie is already set
    }

    // Refresh to re-render with new messages
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      {Object.entries(LOCALE_LABELS).map(([code, label]) => (
        <button
          key={code}
          onClick={() => handleChange(code)}
          disabled={isPending}
          className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
            locale === code
              ? "bg-white/[0.08] text-white/70 font-medium"
              : "text-white/30 hover:text-white/50"
          } ${isPending ? "opacity-50 cursor-wait" : ""}`}
          title={t("switchTo", { language: label })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
