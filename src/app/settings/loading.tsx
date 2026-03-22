import { AppShell } from "@/components/app-shell";
import { SkeletonSettings } from "@/components/skeletons/skeleton-settings";

export default function SettingsLoading() {
  return <AppShell><SkeletonSettings /></AppShell>;
}
