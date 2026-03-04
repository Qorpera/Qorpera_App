export type ConnectorDef = {
  id: string;
  name: string;
  fileTypes: string[];
  parser: "csv" | "json";
};

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "csv",
    name: "CSV File",
    fileTypes: [".csv", ".tsv", ".txt"],
    parser: "csv",
  },
  {
    id: "json",
    name: "JSON File",
    fileTypes: [".json"],
    parser: "json",
  },
];

/**
 * Look up a connector by its id.
 */
export function getConnector(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/**
 * Find a connector that can handle a given file extension.
 */
export function getConnectorForExtension(ext: string): ConnectorDef | undefined {
  const normalised = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return CONNECTORS.find((c) => c.fileTypes.includes(normalised));
}
