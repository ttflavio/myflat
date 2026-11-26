"use server";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/server/db";
import { AppError, ValidationError } from "@/server/errors";
import { getSession } from "@/server/session";
import { updateProperty, updateUnit } from "@/server/units/service";

export type UnitResult = { ok: boolean; message: string } | null;

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const int = (f: FormData, k: string) => {
  const v = text(f, k);
  return v === null ? null : Number(v);
};

function fail(err: unknown): UnitResult {
  unstable_rethrow(err);
  if (err instanceof ValidationError) {
    const issues = Array.isArray(err.issues) ? (err.issues as { message?: string }[]).map((i) => i.message).join("; ") : "";
    return { ok: false, message: issues ? `${err.message} ${issues}` : err.message };
  }
  if (err instanceof AppError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Erro inesperado. Tente de novo." };
}

export async function updateUnitAction(_prev: UnitResult, form: FormData): Promise<UnitResult> {
  try {
    await updateUnit(getDb(), await getSession(), String(form.get("unitId") ?? ""), {
      maxGuests: int(form, "maxGuests"),
      bedrooms: int(form, "bedrooms"),
      beds: int(form, "beds"),
      bathrooms: int(form, "bathrooms"),
      checkInTime: text(form, "checkInTime"),
      checkOutTime: text(form, "checkOutTime"),
      commission: text(form, "commission") as never,
      notes: text(form, "notes"),
      ownerName: text(form, "ownerName"),
      ownerPhone: text(form, "ownerPhone"),
      ownerEmail: text(form, "ownerEmail"),
    });
    refresh();
    return { ok: true, message: "Flat atualizado." };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePropertyAction(_prev: UnitResult, form: FormData): Promise<UnitResult> {
  try {
    await updateProperty(getDb(), await getSession(), String(form.get("propertyId") ?? ""), {
      address: text(form, "address"),
      neighborhood: text(form, "neighborhood"),
    });
    refresh();
    return { ok: true, message: "Endereço salvo." };
  } catch (err) {
    return fail(err);
  }
}
