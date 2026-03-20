export type ConnectorConfig = {
  [key: string]: unknown;
};

export type SyncEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

export type ConnectorCapability = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  sideEffects: string[];
};

export type InferredSchema = {
  suggestedTypeName: string;
  suggestedProperties: Array<{
    name: string;
    dataType: string;
    possibleRole?: string;
    sampleValues: string[];
  }>;
  sampleEntities: Array<Record<string, string>>;
  recordCount: number;
};

export interface ConnectorProvider {
  /** Unique provider ID — matches SourceConnector.provider field */
  id: string;

  /** Human-readable name */
  name: string;

  /** What config fields this provider needs (for the UI) */
  configSchema: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "url" | "oauth";
    required: boolean;
    placeholder?: string;
  }>;

  /** Test if the stored credentials / config actually work */
  testConnection(config: ConnectorConfig): Promise<{
    ok: boolean;
    error?: string;
  }>;

  /**
   * Pull data from the external system as a typed stream of events,
   * content, and activity signals.
   */
  sync(
    config: ConnectorConfig,
    since?: Date
  ): AsyncGenerator<import("./sync-types").SyncYield>;

  /**
   * Execute an action in the external system (optional).
   */
  executeAction?(
    config: ConnectorConfig,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }>;

  /** List the actions this connector can perform. */
  getCapabilities(config: ConnectorConfig): Promise<ConnectorCapability[]>;

  /**
   * Static write-back capability declarations.
   * Registered as ActionCapabilities with writeBackStatus='pending' on connector creation.
   * Admin must enable each capability before it can execute.
   */
  writeCapabilities?: Array<{
    slug: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;

  /**
   * Discover what entity types exist in the external system.
   * Stubbed for Day 2 — full implementation on Day 3.
   */
  inferSchema(config: ConnectorConfig): Promise<InferredSchema[]>;
}
