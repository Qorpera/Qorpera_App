import { z } from "zod";

// Reusable primitives
export const nonEmptyString = z.string().trim().min(1);
export const optionalString = z.string().trim().optional();
export const cuidId = z.string().min(1);
export const paginationParams = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const daysParam = z.coerce.number().int().min(1).max(365).default(30);

// Department
export const createDepartmentSchema = z.object({
  name: nonEmptyString.max(200),
  description: nonEmptyString.max(1000),
  mapX: z.number().optional(),
  mapY: z.number().optional(),
});

export const updateDepartmentSchema = z.object({
  displayName: nonEmptyString.max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  mapX: z.number().optional(),
  mapY: z.number().optional(),
}).refine(data => Object.keys(data).length > 0, { message: "At least one field required" });

// Member
export const createMemberSchema = z.object({
  name: nonEmptyString.max(200),
  role: nonEmptyString.max(200),
  email: z.string().trim().email().max(320),
});

export const updateMemberSchema = z.object({
  displayName: nonEmptyString.max(200).optional(),
  role: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
}).refine(data => Object.keys(data).length > 0, { message: "At least one field required" });

// Entity
export const updateEntitySchema = z.object({
  displayName: nonEmptyString.max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  properties: z.record(z.string(), z.string().max(5000)).optional(),
});

export const assignDepartmentSchema = z.object({
  departmentId: cuidId,
});

// Policy
export const createPolicySchema = z.object({
  name: nonEmptyString.max(200),
  scope: z.enum(["global", "entity_type", "entity"]),
  scopeTargetId: z.string().optional(),
  actionType: nonEmptyString.max(200),
  effect: z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL"]),
  conditions: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().min(0).max(1000).default(0),
});

// Helper to parse and return 400 on validation error
export function parseBody<T extends z.ZodTypeAny>(schema: T, data: unknown): { success: true; data: z.output<T> } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: `${firstError.path.join(".")}: ${firstError.message}` };
  }
  return { success: true, data: result.data };
}

// Helper to parse query params
export function parseQuery<T extends z.ZodTypeAny>(schema: T, params: URLSearchParams): { success: true; data: z.output<T> } | { success: false; error: string } {
  const obj: Record<string, string> = {};
  params.forEach((value, key) => { obj[key] = value; });
  const result = schema.safeParse(obj);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: `${firstError.path.join(".")}: ${firstError.message}` };
  }
  return { success: true, data: result.data };
}
