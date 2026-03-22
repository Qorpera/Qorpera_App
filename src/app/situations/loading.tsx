import { AppShell } from "@/components/app-shell";
import { SkeletonSplitPane } from "@/components/skeletons/skeleton-split-pane";

export default function SituationsLoading() {
  return <AppShell><SkeletonSplitPane /></AppShell>;
}
