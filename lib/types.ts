export type UserProgressRow = {
  user_id: string;
  stage_id: string;
  module_id: string;
  completed_tasks?: unknown[] | null;
  payload?: Record<string, unknown> | null;
};
