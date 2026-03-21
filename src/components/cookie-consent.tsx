"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#141414] border-t border-white/[0.06] px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
        <p className="text-xs text-white/50 leading-relaxed">
          We use essential cookies to operate Qorpera. No tracking or analytics cookies are used.{" "}
          <a href="/privacy" className="text-purple-400 hover:text-purple-300 underline">Privacy Policy</a>
        </p>
        <button
          onClick={accept}
          className="shrink-0 px-4 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
