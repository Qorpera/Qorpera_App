import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const SHIPMONDO_API = "https://app.shipmondo.com/api/public/v3";

// ── Helpers ──────────────────────────────────────────────

async function shipmondoFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const apiUser = config.api_user as string;
  const apiKey = config.api_key as string;
  const credentials = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");

  return fetch(`${SHIPMONDO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateShipmondo<T>(
  config: ConnectorConfig,
  basePath: string
): AsyncGenerator<T> {
  let page = 1;

  while (true) {
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}page=${page}&per_page=50`;
    const resp = await shipmondoFetch(config, url);
    if (!resp.ok) break;
    const data = await resp.json();

    // Shipmondo returns a plain array
    const items = Array.isArray(data) ? data : [];
    if (items.length === 0) break;

    for (const item of items) {
      yield item as T;
    }

    // If fewer than per_page items, we've reached the last page
    if (items.length < 50) break;
    page++;
  }
}

// ── Provider Implementation ──────────────────────────────

export const shipmondoProvider: ConnectorProvider = {
  id: "shipmondo",
  name: "Shipmondo",

  configSchema: [
    {
      key: "api_user",
      label: "API User",
      type: "text",
      required: true,
      placeholder: "From Shipmondo → Settings → API → Access",
    },
    {
      key: "api_key",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "From Shipmondo → Settings → API → Access",
    },
  ],

  writeCapabilities: [
    {
      slug: "create_shipment",
      name: "Create Shipment",
      description:
        "Create a shipment with label in Shipmondo for a given carrier product",
      inputSchema: {
        productCode: "string",
        sender:
          "object { name: string, address1: string, zipcode: string, city: string, country_code: string, email?: string, telephone?: string }",
        receiver:
          "object { name: string, attention?: string, address1: string, zipcode: string, city: string, country_code: string, email?: string, telephone?: string, instruction?: string }",
        parcels: "array<{ weight: number }>",
        orderId: "string?",
        reference: "string?",
      },
    },
    {
      slug: "create_sales_order",
      name: "Create Sales Order",
      description: "Import a sales order into Shipmondo for fulfilment",
      inputSchema: {
        orderId: "string",
        orderNumber: "string?",
        shipTo:
          "object { name: string, address1: string, zipcode: string, city: string, country_code: string }",
        items:
          "array<{ sku: string, quantity: number, description: string }>",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await shipmondoFetch(config, "/account");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Shipmondo API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Sync shipments ──────────────────────────────────────
    let shipmentPath = "/shipments";
    if (since) {
      const sinceISO = since.toISOString();
      shipmentPath += `?created_at_min=${sinceISO}`;
    }

    for await (const ship of paginateShipmondo<any>(config, shipmentPath)) {
      const shipmentId = String(ship.id);
      const carrierCode = ship.carrier_code || "";
      const productCode = ship.product_code || "";
      const status = ship.shipment_status || "unknown";
      const senderName = ship.sender?.name || "";
      const receiverName = ship.receiver?.name || "";
      const receiverCity = ship.receiver?.city || "";
      const receiverCountryCode = ship.receiver?.country_code || "";
      const weight = ship.weight ?? ship.parcels?.[0]?.weight ?? 0;
      const createdAt = ship.created_at || "";
      const labelCreatedAt = ship.label_created_at || "";
      const trackingNumber = ship.pkg_no || "";
      const orderId = ship.order_id || "";

      yield {
        kind: "event" as const,
        data: {
          eventType: "shipment.synced",
          payload: {
            id: shipmentId,
            orderId,
            carrierCode,
            productCode,
            status,
            senderName,
            receiverName,
            receiverCity,
            receiverCountryCode,
            weight,
            createdAt,
            labelCreatedAt,
          },
        },
      };

      // Content: human-readable shipment summary
      const weightStr =
        typeof weight === "number" ? `${weight} g` : String(weight);
      const summaryParts = [
        `Forsendelse ${shipmentId}`,
        orderId ? `til ordre ${orderId}` : null,
        `via ${carrierCode || "ukendt transportør"}`,
        `(${productCode})`,
        `fra ${senderName || "ukendt afsender"}`,
        `til ${receiverName || "ukendt modtager"}`,
        receiverCity ? `i ${receiverCity}` : null,
        receiverCountryCode ? `(${receiverCountryCode})` : null,
        `— vægt: ${weightStr}`,
        `— status: ${status}`,
        labelCreatedAt ? `— label oprettet ${labelCreatedAt}` : null,
      ];

      yield {
        kind: "content" as const,
        data: {
          sourceType: "shipment",
          sourceId: `shipmondo-shipment-${shipmentId}`,
          content: summaryParts.filter(Boolean).join(" "),
          metadata: {
            shipmentId,
            carrierCode,
            productCode,
            status,
            weight,
            orderId,
          },
        },
      };

      // Activity: tracking signal
      yield {
        kind: "activity" as const,
        data: {
          signalType: "shipment_status_update",
          occurredAt: createdAt ? new Date(createdAt) : new Date(),
          metadata: {
            shipmentId,
            status,
            carrierCode,
            trackingNumber,
          },
        },
      };
    }

    // ── Sync sales orders ───────────────────────────────────
    let salesOrderPath = "/sales_orders";
    if (since) {
      const sinceISO = since.toISOString();
      salesOrderPath += `?created_at_min=${sinceISO}`;
    }

    for await (const order of paginateShipmondo<any>(
      config,
      salesOrderPath
    )) {
      const id = String(order.id);
      const orderId = order.order_id || "";
      const orderNumber = order.order_number || "";
      const sourceType = order.source || "";
      const status = order.status || "unknown";
      const shipToName = order.ship_to?.name || "";
      const shipToCity = order.ship_to?.city || "";
      const shipToCountryCode = order.ship_to?.country_code || "";
      const itemCount = order.order_lines?.length ?? 0;
      const createdAt = order.created_at || "";

      yield {
        kind: "event" as const,
        data: {
          eventType: "sales_order.synced",
          payload: {
            id,
            orderId,
            orderNumber,
            sourceType,
            status,
            shipToName,
            shipToCity,
            shipToCountryCode,
            itemCount,
            createdAt,
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_shipment",
        description:
          "Create a shipment with label in Shipmondo for a given carrier product",
        inputSchema: {
          productCode: "string",
          sender:
            "object { name, address1, zipcode, city, country_code, email?, telephone? }",
          receiver:
            "object { name, attention?, address1, zipcode, city, country_code, email?, telephone?, instruction? }",
          parcels: "array<{ weight: number }>",
          orderId: "string?",
          reference: "string?",
        },
        sideEffects: [
          "Shipment created in Shipmondo",
          "Shipping label generated",
        ],
      },
      {
        name: "create_sales_order",
        description: "Import a sales order into Shipmondo for fulfilment",
        inputSchema: {
          orderId: "string",
          orderNumber: "string?",
          shipTo:
            "object { name, address1, zipcode, city, country_code }",
          items:
            "array<{ sku: string, quantity: number, description: string }>",
        },
        sideEffects: ["Sales order created in Shipmondo"],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        // ── 1. Create shipment ────────────────────────────────
        case "create_shipment": {
          if (!params.productCode)
            return { success: false, error: "productCode is required" };
          if (!params.sender)
            return { success: false, error: "sender is required" };
          if (!params.receiver)
            return { success: false, error: "receiver is required" };
          if (!params.parcels || !Array.isArray(params.parcels))
            return { success: false, error: "parcels is required" };

          const sender = params.sender as Record<string, unknown>;
          const receiver = params.receiver as Record<string, unknown>;
          const parcels = params.parcels as Array<{ weight: number }>;

          const body: Record<string, unknown> = {
            product_code: params.productCode,
            service_codes: "",
            sender: {
              name: sender.name,
              address1: sender.address1,
              zipcode: sender.zipcode,
              city: sender.city,
              country_code: sender.country_code,
              ...(sender.email ? { email: sender.email } : {}),
              ...(sender.telephone ? { telephone: sender.telephone } : {}),
            },
            receiver: {
              name: receiver.name,
              address1: receiver.address1,
              zipcode: receiver.zipcode,
              city: receiver.city,
              country_code: receiver.country_code,
              ...(receiver.attention
                ? { attention: receiver.attention }
                : {}),
              ...(receiver.email ? { email: receiver.email } : {}),
              ...(receiver.telephone
                ? { telephone: receiver.telephone }
                : {}),
              ...(receiver.instruction
                ? { instruction: receiver.instruction }
                : {}),
            },
            parcels: parcels.map((p) => ({ weight: p.weight })),
          };

          if (params.orderId) body.order_id = params.orderId;
          if (params.reference) body.reference = params.reference;

          const resp = await shipmondoFetch(config, "/shipments", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Create shipment failed (${resp.status}): ${err}`,
            };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 2. Create sales order ─────────────────────────────
        case "create_sales_order": {
          if (!params.orderId)
            return { success: false, error: "orderId is required" };
          if (!params.shipTo)
            return { success: false, error: "shipTo is required" };
          if (!params.items || !Array.isArray(params.items))
            return { success: false, error: "items is required" };

          const shipTo = params.shipTo as Record<string, unknown>;
          const items = params.items as Array<{
            sku: string;
            quantity: number;
            description: string;
          }>;

          const body: Record<string, unknown> = {
            order_id: params.orderId,
            ...(params.orderNumber
              ? { order_number: params.orderNumber }
              : {}),
            ship_to: {
              name: shipTo.name,
              address1: shipTo.address1,
              zipcode: shipTo.zipcode,
              city: shipTo.city,
              country_code: shipTo.country_code,
            },
            order_lines: items.map((item) => ({
              sku: item.sku,
              quantity: item.quantity,
              description: item.description,
            })),
          };

          const resp = await shipmondoFetch(config, "/sales_orders", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Create sales order failed (${resp.status}): ${err}`,
            };
          }
          return { success: true, result: await resp.json() };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async inferSchema(config): Promise<InferredSchema[]> {
    const schemas: InferredSchema[] = [];

    // Shipments
    const shipResp = await shipmondoFetch(
      config,
      "/shipments?page=1&per_page=5"
    );
    if (shipResp.ok) {
      const records = (await shipResp.json()) as any[];
      schemas.push({
        suggestedTypeName: "Shipment",
        suggestedProperties: [
          {
            name: "carrierCode",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.carrier_code)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "productCode",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.product_code)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "status",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.shipment_status)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "receiverName",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.receiver?.name)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "weight",
            dataType: "NUMBER",
            sampleValues: records
              .map(
                (r: any) =>
                  String(r.weight ?? r.parcels?.[0]?.weight ?? "")
              )
              .filter((v: string) => v !== "")
              .slice(0, 5),
          },
          {
            name: "createdAt",
            dataType: "DATE",
            sampleValues: records
              .map((r: any) => r.created_at)
              .filter(Boolean)
              .slice(0, 5),
          },
        ],
        sampleEntities: records.map((r: any) => ({
          id: String(r.id ?? ""),
          carrierCode: r.carrier_code || "",
          productCode: r.product_code || "",
          status: r.shipment_status || "",
          receiverName: r.receiver?.name || "",
          weight: String(r.weight ?? r.parcels?.[0]?.weight ?? ""),
        })),
        recordCount: records.length,
      });
    }

    // Sales orders
    const orderResp = await shipmondoFetch(
      config,
      "/sales_orders?page=1&per_page=5"
    );
    if (orderResp.ok) {
      const records = (await orderResp.json()) as any[];
      schemas.push({
        suggestedTypeName: "Sales Order",
        suggestedProperties: [
          {
            name: "orderId",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.order_id)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "orderNumber",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.order_number)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "status",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.status)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "shipToName",
            dataType: "STRING",
            sampleValues: records
              .map((r: any) => r.ship_to?.name)
              .filter(Boolean)
              .slice(0, 5),
          },
          {
            name: "itemCount",
            dataType: "NUMBER",
            sampleValues: records
              .map((r: any) => String(r.order_lines?.length ?? ""))
              .filter((v: string) => v !== "")
              .slice(0, 5),
          },
          {
            name: "createdAt",
            dataType: "DATE",
            sampleValues: records
              .map((r: any) => r.created_at)
              .filter(Boolean)
              .slice(0, 5),
          },
        ],
        sampleEntities: records.map((r: any) => ({
          orderId: r.order_id || "",
          orderNumber: r.order_number || "",
          status: r.status || "",
          shipToName: r.ship_to?.name || "",
          itemCount: String(r.order_lines?.length ?? ""),
        })),
        recordCount: records.length,
      });
    }

    return schemas;
  },
};
