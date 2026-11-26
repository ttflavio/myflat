// Pendências: categorias, prioridades e status, com os nomes usados na tela (módulo puro).
export const TASK_CATEGORIES = [
  "MAINTENANCE",
  "CLEANING",
  "PURCHASE",
  "RESTOCK",
  "CHECK_IN",
  "CHECK_OUT",
  "GUEST_REQUEST",
  "GUEST_SERVICE",
  "DOCUMENTS",
  "FINANCE",
  "OTHER",
] as const;
export type TaskCategoryName = (typeof TASK_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<TaskCategoryName, string> = {
  MAINTENANCE: "Manutenção",
  CLEANING: "Limpeza",
  PURCHASE: "Compras",
  RESTOCK: "Reposição",
  CHECK_IN: "Check-in",
  CHECK_OUT: "Check-out",
  GUEST_REQUEST: "Pedido de hóspede",
  GUEST_SERVICE: "Atendimento",
  DOCUMENTS: "Documentos",
  FINANCE: "Financeiro",
  OTHER: "Outros",
};

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriorityName = (typeof TASK_PRIORITIES)[number];
export const PRIORITY_LABEL: Record<TaskPriorityName, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const TASK_STATUSES = ["INBOX", "TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"] as const;
export type TaskStatusName = (typeof TASK_STATUSES)[number];
export const STATUS_LABEL: Record<TaskStatusName, string> = {
  INBOX: "A revisar",
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando terceiros",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};
export const OPEN_STATUSES: TaskStatusName[] = ["INBOX", "TODO", "IN_PROGRESS", "WAITING"];
