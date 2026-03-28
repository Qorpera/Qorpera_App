import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── XML Helpers ──────────────────────────────────────────

function parseXmlValue(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, "i");
  const match = xml.match(re);
  if (match) return match[1].trim() || null;
  // Self-closing tag
  if (new RegExp(`<${tagName}\\s*/>`, "i").test(xml)) return null;
  return null;
}

function parseXmlArray(xml: string, elementName: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${elementName}[^>]*>([\\s\\S]*?)</${elementName}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function isErrorResponse(xml: string): string | null {
  const isError = parseXmlValue(xml, "IsError");
  if (isError === "true" || isError === "True") {
    return parseXmlValue(xml, "ErrorMessage") || parseXmlValue(xml, "Description") || "Unknown error";
  }
  const status = parseXmlValue(xml, "ProcessingStatus");
  if (status === "Error") {
    return parseXmlValue(xml, "ErrorMessage") || parseXmlValue(xml, "Description") || "Processing error";
  }
  return null;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ── Network Helpers ──────────────────────────────────────

function basicAuthHeader(config: ConnectorConfig): string {
  return "Basic " + Buffer.from(`${config.username}:${config.password}`).toString("base64");
}

async function cwPost(config: ConnectorConfig, xmlBody: string): Promise<string> {
  const resp = await fetch(config.endpoint_url as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      Authorization: basicAuthHeader(config),
    },
    body: xmlBody,
  });

  if (!resp.ok) {
    throw new Error(`CargoWise eAdaptor ${resp.status}: ${resp.statusText}`);
  }

  return resp.text();
}

function buildUniversalQuery(entityType: string, filter?: Date): string {
  const filterXml = filter
    ? `<CriteriaGroup><Criteria><Type>Modified</Type><Value>${filter.toISOString()}</Value></Criteria></CriteriaGroup>`
    : "";

  return `<UniversalInterchange>
  <Header>
    <SenderID>QORPERA</SenderID>
    <ReceiverID>CW1</ReceiverID>
  </Header>
  <Body>
    <UniversalShipment>
      <DataContext>
        <DataTargetCollection>
          <DataTarget>
            <Type>${entityType}</Type>
          </DataTarget>
        </DataTargetCollection>
        ${filterXml}
      </DataContext>
    </UniversalShipment>
  </Body>
</UniversalInterchange>`;
}

// ── Provider Implementation ──────────────────────────────

export const cargowiseProvider: ConnectorProvider = {
  id: "cargowise",
  name: "CargoWise",

  configSchema: [
    { key: "endpoint_url", label: "eAdaptor Endpoint URL", type: "url", required: true, placeholder: "https://your-instance.wisegrid.net/eadaptor" },
    { key: "username", label: "eAdaptor Username", type: "text", required: true },
    { key: "password", label: "eAdaptor Password", type: "password", required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_shipment",
      name: "Create Shipment",
      description: "Creates a new forwarding shipment in CargoWise",
      inputSchema: { type: "object", properties: { consignor: { type: "string" }, consignee: { type: "string" }, origin: { type: "string" }, destination: { type: "string" }, transportMode: { type: "string" }, carrier: { type: "string" }, commodity: { type: "string" } }, required: ["consignor", "consignee", "origin", "destination", "transportMode"] },
    },
    {
      slug: "update_shipment_milestone",
      name: "Update Shipment Milestone",
      description: "Adds a milestone to an existing shipment in CargoWise",
      inputSchema: { type: "object", properties: { shipmentNumber: { type: "string" }, milestoneCode: { type: "string" }, milestoneDate: { type: "string" }, description: { type: "string" }, location: { type: "string" } }, required: ["shipmentNumber", "milestoneCode", "milestoneDate"] },
    },
    {
      slug: "update_shipment_routing",
      name: "Update Shipment Routing",
      description: "Updates routing info (vessel, voyage, ETD, ETA) on a shipment",
      inputSchema: { type: "object", properties: { shipmentNumber: { type: "string" }, vesselName: { type: "string" }, voyageNumber: { type: "string" }, etd: { type: "string" }, eta: { type: "string" } }, required: ["shipmentNumber"] },
    },
  ],

  async testConnection(config) {
    try {
      const xml = `<UniversalInterchange><Header><SenderID>QORPERA</SenderID><ReceiverID>CW1</ReceiverID></Header><Body><UniversalShipment/></Body></UniversalInterchange>`;
      const resp = await cwPost(config, xml);
      // Any non-empty response means the eAdaptor is alive (even error XML)
      if (resp && resp.length > 0) return { ok: true };
      return { ok: false, error: "Empty response from eAdaptor" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    let shipmentResponseXml = "";

    // ── Shipments ─────────────────────────────────────────
    try {
      const queryXml = buildUniversalQuery("ForwardingShipment", since || undefined);
      shipmentResponseXml = await cwPost(config, queryXml);

      const error = isErrorResponse(shipmentResponseXml);
      if (error) {
        console.warn(`[cargowise] Shipment query error: ${error}`);
      } else {
        const shipments = parseXmlArray(shipmentResponseXml, "UniversalShipment");

        for (const shipmentXml of shipments) {
          const shipmentNumber = parseXmlValue(shipmentXml, "ShipmentNumber") || parseXmlValue(shipmentXml, "DataSourceID") || "";
          if (!shipmentNumber) continue;

          const origin = parseXmlValue(shipmentXml, "OriginPort") || parseXmlValue(shipmentXml, "OriginCity") || undefined;
          const destination = parseXmlValue(shipmentXml, "DestinationPort") || parseXmlValue(shipmentXml, "DestinationCity") || undefined;
          const carrier = parseXmlValue(shipmentXml, "Carrier") || parseXmlValue(shipmentXml, "ShippingLine") || undefined;
          const mode = parseXmlValue(shipmentXml, "TransportMode") || undefined;
          const status = parseXmlValue(shipmentXml, "Status") || undefined;
          const eta = parseXmlValue(shipmentXml, "ETA") || undefined;
          const etd = parseXmlValue(shipmentXml, "ETD") || parseXmlValue(shipmentXml, "DepartureDate") || undefined;
          const trackingNumber = parseXmlValue(shipmentXml, "MasterBillNumber") || parseXmlValue(shipmentXml, "HouseBillNumber") || shipmentNumber;

          // ── Shipment event ───────────────────────────────
          yield {
            kind: "event" as const,
            data: {
              eventType: "shipment.synced",
              payload: {
                id: shipmentNumber,
                trackingNumber,
                status: status || "Unknown",
                origin,
                destination,
                carrier,
                mode,
                eta,
                departureDate: etd,
              },
            },
          };

          // ── Milestones → activity signals ────────────────
          const milestones = parseXmlArray(shipmentXml, "Milestone");
          for (const msXml of milestones) {
            const desc = parseXmlValue(msXml, "Description") || parseXmlValue(msXml, "MilestoneCode") || "Milestone";
            const msDate = parseXmlValue(msXml, "Date") || parseXmlValue(msXml, "ActualDate");
            const location = parseXmlValue(msXml, "Location") || undefined;
            const vessel = parseXmlValue(msXml, "VesselName") || undefined;

            yield {
              kind: "activity" as const,
              data: {
                signalType: "shipment_milestone",
                metadata: {
                  shipmentNumber,
                  milestone: desc,
                  location,
                  vessel,
                },
                occurredAt: msDate ? new Date(msDate) : new Date(),
              },
            };
          }

          // ── Shipment content summary ─────────────────────
          const milestoneLines = milestones.map((msXml) => {
            const desc = parseXmlValue(msXml, "Description") || "Milestone";
            const date = parseXmlValue(msXml, "Date") || "";
            return `${date}: ${desc}`;
          });

          yield {
            kind: "content" as const,
            data: {
              sourceType: "shipment_detail",
              sourceId: `cargowise-${shipmentNumber}`,
              content: `Shipment ${shipmentNumber}: ${origin || "?"} → ${destination || "?"}, Carrier: ${carrier || "?"}, Status: ${status || "?"}, ETD: ${etd || "?"}, ETA: ${eta || "?"}${milestoneLines.length > 0 ? `. Milestones: ${milestoneLines.join("; ")}` : ""}`,
              metadata: { shipmentNumber, carrier, mode },
            },
          };
        }
      }
    } catch (err) {
      console.warn("[cargowise] Shipment sync error:", err);
    }

    // ── Financial data (from shipment response) ────────────
    try {
      // Charges are often nested in shipment XML — reuse the already-fetched response
      if (shipmentResponseXml && !isErrorResponse(shipmentResponseXml)) {
        const invoices = parseXmlArray(shipmentResponseXml, "Invoice");
        for (const invXml of invoices) {
          const invoiceNumber = parseXmlValue(invXml, "InvoiceNumber") || parseXmlValue(invXml, "Number");
          if (!invoiceNumber) continue;
          const total = parseXmlValue(invXml, "TotalCharges") || parseXmlValue(invXml, "Amount") || "0";
          const currency = parseXmlValue(invXml, "Currency") || parseXmlValue(invXml, "ChargeCurrency") || undefined;

          yield {
            kind: "event" as const,
            data: {
              eventType: "invoice.created",
              payload: {
                id: invoiceNumber,
                number: invoiceNumber,
                amount_due: parseFloat(total) || 0,
                total: parseFloat(total) || 0,
                status: "open",
                currency,
              },
            },
          };
        }
      }
    } catch {
      // Financial data not available — skip silently
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_shipment": {
          if (!params.consignor) return { success: false, error: "consignor is required" };
          if (!params.consignee) return { success: false, error: "consignee is required" };
          if (!params.origin) return { success: false, error: "origin is required" };
          if (!params.destination) return { success: false, error: "destination is required" };
          if (!params.transportMode) return { success: false, error: "transportMode is required" };

          const xml = `<UniversalInterchange>
  <Header><SenderID>QORPERA</SenderID><ReceiverID>CW1</ReceiverID></Header>
  <Body>
    <UniversalShipment>
      <Consignor>${escapeXml(String(params.consignor))}</Consignor>
      <Consignee>${escapeXml(String(params.consignee))}</Consignee>
      <OriginPort>${escapeXml(String(params.origin))}</OriginPort>
      <DestinationPort>${escapeXml(String(params.destination))}</DestinationPort>
      <TransportMode>${escapeXml(String(params.transportMode))}</TransportMode>
      ${params.carrier ? `<Carrier>${escapeXml(String(params.carrier))}</Carrier>` : ""}
      ${params.commodity ? `<Commodity>${escapeXml(String(params.commodity))}</Commodity>` : ""}
    </UniversalShipment>
  </Body>
</UniversalInterchange>`;

          const responseXml = await cwPost(config, xml);
          const error = isErrorResponse(responseXml);
          if (error) return { success: false, error: `Create shipment failed: ${error}` };
          return { success: true, result: { shipmentNumber: parseXmlValue(responseXml, "ShipmentNumber") } };
        }

        case "update_shipment_milestone": {
          if (!params.shipmentNumber) return { success: false, error: "shipmentNumber is required" };
          if (!params.milestoneCode) return { success: false, error: "milestoneCode is required" };
          if (!params.milestoneDate) return { success: false, error: "milestoneDate is required" };

          const xml = `<UniversalInterchange>
  <Header><SenderID>QORPERA</SenderID><ReceiverID>CW1</ReceiverID></Header>
  <Body>
    <UniversalShipment>
      <ShipmentNumber>${escapeXml(String(params.shipmentNumber))}</ShipmentNumber>
      <Milestone>
        <MilestoneCode>${escapeXml(String(params.milestoneCode))}</MilestoneCode>
        <Date>${escapeXml(String(params.milestoneDate))}</Date>
        ${params.description ? `<Description>${escapeXml(String(params.description))}</Description>` : ""}
        ${params.location ? `<Location>${escapeXml(String(params.location))}</Location>` : ""}
      </Milestone>
    </UniversalShipment>
  </Body>
</UniversalInterchange>`;

          const responseXml = await cwPost(config, xml);
          const error = isErrorResponse(responseXml);
          if (error) return { success: false, error: `Update milestone failed: ${error}` };
          return { success: true, result: { shipmentNumber: params.shipmentNumber } };
        }

        case "update_shipment_routing": {
          if (!params.shipmentNumber) return { success: false, error: "shipmentNumber is required" };

          const xml = `<UniversalInterchange>
  <Header><SenderID>QORPERA</SenderID><ReceiverID>CW1</ReceiverID></Header>
  <Body>
    <UniversalShipment>
      <ShipmentNumber>${escapeXml(String(params.shipmentNumber))}</ShipmentNumber>
      ${params.vesselName ? `<VesselName>${escapeXml(String(params.vesselName))}</VesselName>` : ""}
      ${params.voyageNumber ? `<VoyageNumber>${escapeXml(String(params.voyageNumber))}</VoyageNumber>` : ""}
      ${params.etd ? `<ETD>${escapeXml(String(params.etd))}</ETD>` : ""}
      ${params.eta ? `<ETA>${escapeXml(String(params.eta))}</ETA>` : ""}
    </UniversalShipment>
  </Body>
</UniversalInterchange>`;

          const responseXml = await cwPost(config, xml);
          const error = isErrorResponse(responseXml);
          if (error) return { success: false, error: `Update routing failed: ${error}` };
          return { success: true, result: { shipmentNumber: params.shipmentNumber } };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_shipment",
        description: "Create a new forwarding shipment in CargoWise",
        inputSchema: { consignor: "string", consignee: "string", origin: "string", destination: "string", transportMode: "string", carrier: "string?", commodity: "string?" },
        sideEffects: ["Shipment created in CargoWise"],
      },
      {
        name: "update_shipment_milestone",
        description: "Add a milestone to an existing shipment in CargoWise",
        inputSchema: { shipmentNumber: "string", milestoneCode: "string", milestoneDate: "string", description: "string?", location: "string?" },
        sideEffects: ["Milestone added to shipment in CargoWise"],
      },
      {
        name: "update_shipment_routing",
        description: "Update routing info on a shipment in CargoWise",
        inputSchema: { shipmentNumber: "string", vesselName: "string?", voyageNumber: "string?", etd: "string?", eta: "string?" },
        sideEffects: ["Shipment routing updated in CargoWise"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};

// Export XML helpers for testing
export { parseXmlValue, parseXmlArray, isErrorResponse, escapeXml };
