import { AppShell } from "@/components/app-shell";
import { SkeletonSplitPane } from "@/components/skeletons/skeleton-split-pane";

export default function IdeasLoading() {
  return <AppShell><SkeletonSplitPane /></AppShell>;
}
