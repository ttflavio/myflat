import type { Metadata } from "next";
import { Suspense } from "react";
import { getSession } from "@/server/session";
import { ROLE_LABEL } from "@/server/auth/members";
import { PASSWORD_MIN } from "@/server/auth/password";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Minha conta" };

async function Account() {
  const s = await getSession({ allowPasswordChange: true });
  return (
    <>
      {s.mustChangePassword && (
        <p className="mb-4 max-w-[480px] rounded-[10px] border border-warn bg-warn-bg p-3 text-sm text-warn-ink">
          Você entrou com uma senha provisória. Crie a sua senha para continuar.
        </p>
      )}
      <dl className="mb-6 grid max-w-[480px] grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-mute">Nome</dt><dd>{s.userName}</dd>
        <dt className="text-mute">E-mail</dt><dd>{s.userEmail}</dd>
        <dt className="text-mute">Organização</dt><dd>{s.organizationName}</dd>
        <dt className="text-mute">Papel</dt><dd>{ROLE_LABEL[s.role]}</dd>
      </dl>
      <h2 className="text-lg font-bold">Trocar senha</h2>
      <p className="mb-2 text-sm text-mute">Mínimo de {PASSWORD_MIN} caracteres. As outras sessões abertas serão encerradas.</p>
      <PasswordForm />
    </>
  );
}

export default function AccountPage() {
  return (
    <>
      <h1 className="mb-4 text-[clamp(26px,3vw,34px)] font-bold">Minha conta</h1>
      <Suspense fallback={<div className="h-40 max-w-[480px] animate-pulse rounded-[14px] bg-soft" />}>
        <Account />
      </Suspense>
    </>
  );
}
