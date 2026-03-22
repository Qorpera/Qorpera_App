import { AppShell } from "@/components/app-shell";
import { SkeletonAccount } from "@/components/skeletons/skeleton-account";

export default function AccountLoading() {
  return <AppShell><SkeletonAccount /></AppShell>;
}
