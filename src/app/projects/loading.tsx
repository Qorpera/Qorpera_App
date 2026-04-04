import { AppShell } from "@/components/app-shell";

export default function ProjectsLoading() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 60px" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div className="animate-pulse" style={{ width: 100, height: 16, borderRadius: 6, background: "rgba(255,255,255,0.08)", margin: "0 auto 10px" }} />
            <div className="animate-pulse" style={{ width: 200, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.05)", margin: "0 auto" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.035)",
                  border: "0.5px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding: "18px 20px",
                  minHeight: 120,
                }}
              >
                <div className="animate-pulse" style={{ width: 60, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginBottom: 14 }} />
                <div className="animate-pulse" style={{ width: "70%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.08)", marginBottom: 24 }} />
                <div className="flex items-center justify-between">
                  <div className="animate-pulse" style={{ width: 40, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }} />
                  <div className="animate-pulse" style={{ width: 80, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
