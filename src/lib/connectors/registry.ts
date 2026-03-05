import type { ConnectorProvider } from "./types";
import { googleSheetsProvider } from "./google-sheets";

const PROVIDERS: ConnectorProvider[] = [googleSheetsProvider];

export function getProvider(id: string): ConnectorProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function listProviders(): Array<{
  id: string;
  name: string;
  configSchema: ConnectorProvider["configSchema"];
}> {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    configSchema: p.configSchema,
  }));
}
