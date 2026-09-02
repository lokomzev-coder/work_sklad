import type { Role } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  EMPLOYEE: "Сотрудник",
  PRODUCTION: "Производство (только цех)",
};
