import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-side px-4 py-10">
      <div className="w-full max-w-[380px] rounded-2xl bg-bg p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-2.5 font-display text-xl font-bold">
          <span className="grid size-[30px] place-items-center rounded-lg bg-[#3fb3a6] text-side">M</span>
          MyFlat
        </div>
        <h1 className="text-2xl font-bold">Entrar</h1>
        <p className="mb-2 mt-1 text-mute">Use o e-mail cadastrado pela sua administradora.</p>
        <LoginForm />
      </div>
    </div>
  );
}
