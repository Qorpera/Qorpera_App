"use client";

import { useUser } from "./user-provider";
import type { ReactNode } from "react";

const ROLE_HIERARCHY: Record<string, number> = {
  member: 0,
  admin: 1,
  superadmin: 2,
};

/**
 * Renders children only if the current user's role meets the minimum.
 * Role hierarchy: superadmin > admin > member
 */
export function RoleGuard({
  requiredRole,
  children,
  fallback = null,
}: {
  requiredRole: "admin" | "superadmin";
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role, isLoading } = useUser();

  if (isLoading) return null;

  const userLevel = ROLE_HIERARCHY[role ?? "member"] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

  if (userLevel >= requiredLevel) return <>{children}</>;
  return <>{fallback}</>;
}
