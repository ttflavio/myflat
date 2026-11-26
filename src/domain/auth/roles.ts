// Papéis da organização e seus nomes na interface (módulo puro, usável no cliente).
export const ROLES = ["OWNER", "ADMIN", "OPERATOR", "CLEANING", "FINANCE", "PROPERTY_OWNER"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABEL: Record<RoleName, string> = {
  OWNER: "Dona/dono",
  ADMIN: "Administração",
  OPERATOR: "Atendimento e reservas",
  CLEANING: "Limpeza e manutenção",
  FINANCE: "Financeiro",
  PROPERTY_OWNER: "Proprietário do imóvel",
};

export const ROLE_HINT: Record<RoleName, string> = {
  OWNER: "Tudo, inclusive gerenciar outros donos.",
  ADMIN: "Tudo, menos mexer em donos.",
  OPERATOR: "Reservas, bloqueios e tarefas.",
  CLEANING: "Vê a agenda e cuida das tarefas.",
  FINANCE: "Vê reservas e o financeiro.",
  PROPERTY_OWNER: "Vê reservas e o financeiro.",
};
