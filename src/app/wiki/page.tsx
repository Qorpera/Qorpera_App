"use client";

import { Suspense } from "react";
import { WikiPageClient } from "./wiki-page-client";

export default function WikiIndexPage() {
  return (
    <Suspense fallback={null}>
      <WikiPageClient activeSlug="" />
    </Suspense>
  );
}
