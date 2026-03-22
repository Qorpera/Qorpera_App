import { AppShell } from "@/components/app-shell";
import { SkeletonChat } from "@/components/skeletons/skeleton-chat";

export default function CopilotLoading() {
  return <AppShell><SkeletonChat /></AppShell>;
}
