import { AppShell } from "@/components/app-shell";
import { getOperatorId } from "@/lib/auth";
import { getPendingProposalCount } from "@/lib/action-executor";
import EntityGraph from "@/components/entity-graph";

export default async function EntityMapPage() {
  const operatorId = await getOperatorId();
  const pendingApprovals = await getPendingProposalCount(operatorId);

  return (
    <AppShell pendingApprovals={pendingApprovals}>
      <div className="h-[calc(100vh-0px)]">
        <EntityGraph />
      </div>
    </AppShell>
  );
}
