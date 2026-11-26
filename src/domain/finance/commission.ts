// Comissão da administração (regras do contrato da cliente inicial):
// - reserva por plataforma: percentual sobre o valor LÍQUIDO recebido da plataforma;
// - reserva direta (direto/WhatsApp/manual): percentual sobre o valor TOTAL;
// - imóvel próprio (rate nulo): sem comissão.
// Valores em centavos para evitar erro de arredondamento.

export type ChannelKind = "AIRBNB" | "BOOKING" | "DECOLAR" | "WHATSAPP" | "DIRECT" | "MANUAL" | "OTHER";

const PLATFORMS: ReadonlySet<ChannelKind> = new Set(["AIRBNB", "BOOKING", "DECOLAR", "OTHER"]);

export function isPlatform(channel: ChannelKind): boolean {
  return PLATFORMS.has(channel);
}

export type CommissionInput = {
  channel: ChannelKind;
  totalCents: number;
  channelFeeCents: number;
  /** 0.15, 0.20 ou null (imóvel próprio). */
  rate: number | null;
};

export function netCents({ totalCents, channelFeeCents }: Pick<CommissionInput, "totalCents" | "channelFeeCents">): number {
  return Math.max(0, totalCents - channelFeeCents);
}

export function commissionCents(input: CommissionInput): number {
  if (input.rate == null) return 0;
  const base = isPlatform(input.channel) ? netCents(input) : input.totalCents;
  return Math.round(base * input.rate);
}
