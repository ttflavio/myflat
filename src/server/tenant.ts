// Contexto de quem está agindo. Vem SEMPRE da sessão no servidor, nunca do cliente.
// Toda consulta de negócio filtra por organizationId (ADR-0002).
import type { Role } from "@/generated/prisma/enums";
import { ForbiddenError } from "./errors";

export type TenantContext = {
  organizationId: string;
  userId: string;
  role: Role;
};

export type Permission =
  | "reservation:read"
  | "reservation:write"
  | "availability:block"
  | "unit:write"
  | "task:read"
  | "task:write"
  | "finance:read"
  | "settings:write";

const ALL: Permission[] = [
  "reservation:read",
  "reservation:write",
  "availability:block",
  "unit:write",
  "task:read",
  "task:write",
  "finance:read",
  "settings:write",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  OPERATOR: ["reservation:read", "reservation:write", "availability:block", "task:read", "task:write"],
  CLEANING: ["reservation:read", "task:read", "task:write"],
  FINANCE: ["reservation:read", "finance:read", "task:read"],
  PROPERTY_OWNER: ["reservation:read", "finance:read"],
};

export function can(ctx: TenantContext, permission: Permission): boolean {
  return ROLE_PERMISSIONS[ctx.role].includes(permission);
}

export function assertCan(ctx: TenantContext, permission: Permission): void {
  if (!can(ctx, permission)) throw new ForbiddenError(permission);
}
