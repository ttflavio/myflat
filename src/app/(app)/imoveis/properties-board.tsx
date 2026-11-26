"use client";

import { useActionState, useState, useTransition } from "react";
import type { PropertyView, UnitView } from "@/server/units/service";
import { updatePropertyAction, updateUnitAction, type UnitResult } from "./actions";

const label = "mb-1 mt-3 block text-[13px] text-mute";
const COMMISSION: Record<string, string> = { OWN: "Flat da administradora (sem comissão)", "0.15": "Administração · 15%", "0.20": "Administração + divulgação · 20%" };

function Msg({ r }: { r: UnitResult }) {
  if (!r) return null;
  return (
    <p role="status" className={`mt-3 rounded-[10px] border p-2.5 text-sm ${r.ok ? "border-ok" : "border-warn bg-warn-bg text-warn-ink"}`}>
      {r.message}
    </p>
  );
}

function Info({ k, v }: { k: string; v: string | null }) {
  return (
    <>
      <dt className="text-mute">{k}</dt>
      <dd>{v ?? <span className="text-mute">a informar</span>}</dd>
    </>
  );
}

function AddressForm({ p }: { p: PropertyView }) {
  const [state, action, pending] = useActionState(updatePropertyAction, null);
  return (
    <form action={action} className="mt-2 grid gap-x-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="propertyId" value={p.id} />
      <div>
        <label className={label} htmlFor={`addr-${p.id}`}>Endereço</label>
        <input className="field" id={`addr-${p.id}`} name="address" defaultValue={p.address ?? ""} placeholder="Rua, número" />
      </div>
      <div>
        <label className={label} htmlFor={`nb-${p.id}`}>Bairro</label>
        <input className="field" id={`nb-${p.id}`} name="neighborhood" defaultValue={p.neighborhood ?? ""} />
      </div>
      <button className="btn mt-3" disabled={pending}>{pending ? "Salvando…" : "Salvar endereço"}</button>
      <div className="sm:col-span-3"><Msg r={state} /></div>
    </form>
  );
}

function UnitCard({ u, canEdit }: { u: UnitView; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<UnitResult>(null);
  const [pending, start] = useTransition();
  // Envio manual: em caso de erro o formulário mantém o que foi digitado; com sucesso, fecha.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateUnitAction(null, fd);
      setState(r);
      if (r?.ok) setEditing(false);
    });
  };
  const n = (v: number | null) => (v == null ? "" : String(v));

  return (
    <div className="rounded-[14px] border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">Flat {u.code}</h3>
          <span className="text-sm text-mute">{u.propertyName}</span>
        </div>
        {canEdit && !editing && <button className="btn min-h-9 px-3 text-[13px]" onClick={() => setEditing(true)}>Editar</button>}
      </div>

      {!editing ? (
        <>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <Info k="Hóspedes" v={u.maxGuests != null ? `até ${u.maxGuests}` : null} />
            <Info k="Quartos · camas · banheiros" v={u.bedrooms != null && u.beds != null && u.bathrooms != null ? `${u.bedrooms} · ${u.beds} · ${u.bathrooms}` : null} />
            <Info k="Check-in / check-out" v={u.checkInTime && u.checkOutTime ? `${u.checkInTime} / ${u.checkOutTime}` : null} />
            <Info k="Modalidade" v={u.commission ? COMMISSION[u.commission] : null} />
            {u.commission !== "OWN" && <Info k="Proprietário" v={u.ownerName ? [u.ownerName, u.ownerPhone].filter(Boolean).join(" · ") : null} />}
          </dl>
          {u.notes && <p className="mt-2 text-sm">{u.notes}</p>}
          {u.missing.length > 0 && <p className="mt-3 text-[13px] text-warn-ink">Falta: {u.missing.join(", ")}.</p>}
          <Msg r={state} />
        </>
      ) : (
        <form onSubmit={submit}>
          <input type="hidden" name="unitId" value={u.id} />
          <div className="grid grid-cols-2 gap-x-3">
            <div>
              <label className={label} htmlFor={`g-${u.id}`}>Hóspedes (máx.)</label>
              <input className="field" id={`g-${u.id}`} name="maxGuests" type="number" min={1} max={30} defaultValue={n(u.maxGuests)} />
            </div>
            <div>
              <label className={label} htmlFor={`br-${u.id}`}>Quartos</label>
              <input className="field" id={`br-${u.id}`} name="bedrooms" type="number" min={0} max={20} defaultValue={n(u.bedrooms)} />
            </div>
            <div>
              <label className={label} htmlFor={`bd-${u.id}`}>Camas</label>
              <input className="field" id={`bd-${u.id}`} name="beds" type="number" min={0} max={30} defaultValue={n(u.beds)} />
            </div>
            <div>
              <label className={label} htmlFor={`ba-${u.id}`}>Banheiros</label>
              <input className="field" id={`ba-${u.id}`} name="bathrooms" type="number" min={0} max={20} defaultValue={n(u.bathrooms)} />
            </div>
            <div>
              <label className={label} htmlFor={`ci-${u.id}`}>Check-in a partir de</label>
              <input className="field" id={`ci-${u.id}`} name="checkInTime" type="time" defaultValue={u.checkInTime ?? ""} />
            </div>
            <div>
              <label className={label} htmlFor={`co-${u.id}`}>Check-out até</label>
              <input className="field" id={`co-${u.id}`} name="checkOutTime" type="time" defaultValue={u.checkOutTime ?? ""} />
            </div>
          </div>
          <label className={label} htmlFor={`cm-${u.id}`}>Modalidade</label>
          <select className="field" id={`cm-${u.id}`} name="commission" defaultValue={u.commission ?? ""}>
            <option value="">A definir</option>
            {Object.entries(COMMISSION).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <fieldset className="mt-3 rounded-[10px] border border-line p-3">
            <legend className="px-1 text-[13px] text-mute">Proprietário (se não for da administradora)</legend>
            <label className="mb-1 block text-[13px] text-mute" htmlFor={`on-${u.id}`}>Nome</label>
            <input className="field" id={`on-${u.id}`} name="ownerName" defaultValue={u.ownerName ?? ""} autoComplete="off" />
            <div className="grid grid-cols-2 gap-x-3">
              <div>
                <label className={label} htmlFor={`op-${u.id}`}>Telefone</label>
                <input className="field" id={`op-${u.id}`} name="ownerPhone" inputMode="tel" defaultValue={u.ownerPhone ?? ""} autoComplete="off" />
              </div>
              <div>
                <label className={label} htmlFor={`oe-${u.id}`}>E-mail</label>
                <input className="field" id={`oe-${u.id}`} name="ownerEmail" type="email" defaultValue={u.ownerEmail ?? ""} autoComplete="off" />
              </div>
            </div>
          </fieldset>
          <label className={label} htmlFor={`nt-${u.id}`}>Observações</label>
          <textarea className="field min-h-16" id={`nt-${u.id}`} name="notes" defaultValue={u.notes ?? ""} />
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
          </div>
          <Msg r={state} />
        </form>
      )}
    </div>
  );
}

export function PropertiesBoard({ properties, units, canEdit }: { properties: PropertyView[]; units: UnitView[]; canEdit: boolean }) {
  const pending = units.filter((u) => u.missing.length).length;
  return (
    <div className="grid gap-6">
      {pending > 0 && (
        <p className="rounded-[10px] border border-line bg-soft p-3 text-sm">
          {pending} de {units.length} flats ainda têm dados a informar. Clique em <b>Editar</b> no flat para completar.
        </p>
      )}
      {properties.map((p) => (
        <section key={p.id}>
          <h2 className="text-xl font-bold">{p.name}</h2>
          <p className="text-sm text-mute">
            {[p.address, p.neighborhood, p.city].filter(Boolean).join(" · ")}
          </p>
          {canEdit && <AddressForm p={p} />}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {units.filter((u) => u.propertyId === p.id).map((u) => (
              <UnitCard key={u.id} u={u} canEdit={canEdit} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
