import { AppShell } from "@/components/app-shell";
import EntityGraph from "@/components/entity-graph";

export default async function EntityMapPage() {
  return (
    <AppShell>
      <div className="h-[calc(100vh-0px)]">
        <EntityGraph />
      </div>
    </AppShell>
  );
}
