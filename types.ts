
export type RecurringType = 'daily' | 'weekly' | 'once';

export interface RoutineTemplate {
  id: string;
  text: string;
  type: RecurringType;
  days: number[]; // 0-6 for weekly (Sunday to Saturday)
  isActive: boolean; // For archiving instead of deleting
  order: number; // For manual sorting/priority
}

export interface CheckStatus {
  date: string; // ISO date string (YYYY-MM-DD)
  templateId: string;
  completed: boolean;
}

export interface Schedule {
  id: string;
  date: string;
  time: string;
  text: string;
  color?: string; // Hex or tailwind class name
}

export interface DiaryEntry {
  date: string;
  content: string;
  mood?: string;
}

export interface AppState {
  routines: RoutineTemplate[];
  checkStatuses: CheckStatus[];
  schedules: Schedule[];
  diaries: DiaryEntry[];
}
