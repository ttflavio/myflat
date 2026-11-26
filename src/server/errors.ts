export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super("not_found", `${entity} não encontrado.`);
  }
}

export class ForbiddenError extends AppError {
  constructor(permission: string) {
    super("forbidden", `Sem permissão para: ${permission}.`);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly issues: unknown = undefined,
  ) {
    super("validation", message);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super("invalid_transition", `Não é possível mudar a reserva de ${from} para ${to}.`);
  }
}

export type ConflictingOccupancy = {
  id: string;
  kind: string;
  checkIn: string;
  checkOut: string;
  reservationCode: string | null;
  note: string | null;
};

export class AvailabilityConflictError extends AppError {
  constructor(public readonly conflicts: ConflictingOccupancy[]) {
    super(
      "availability_conflict",
      conflicts.length
        ? `Datas indisponíveis: ${conflicts.map((c) => `${c.reservationCode ?? c.note ?? c.kind} (${c.checkIn} a ${c.checkOut})`).join(", ")}.`
        : "Datas indisponíveis.",
    );
  }
}

/** Violação da constraint occupancies_no_overlap (SQLSTATE 23P01), venha do driver ou do Prisma. */
export function isOverlapViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): boolean => {
    if (!v || typeof v !== "object" || seen.has(v) || depth > 6) return false;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (o.code === "23P01" || o.originalCode === "23P01") return true;
    if (typeof o.message === "string" && o.message.includes("occupancies_no_overlap")) return true;
    if (o.constraint === "occupancies_no_overlap") return true;
    return Object.values(o).some((x) => walk(x, depth + 1)) || walk((v as { cause?: unknown }).cause, depth + 1);
  };
  return walk(err, 0);
}
