"use client";

import { Suspense } from "react";
import { WikiPageClient } from "../wiki-page-client";

export default function WikiSlugPage({ params }: { params: { slug: string } }) {
  return (
    <Suspense fallback={null}>
      <WikiPageClient activeSlug={decodeURIComponent(params.slug)} />
    </Suspense>
  );
}
