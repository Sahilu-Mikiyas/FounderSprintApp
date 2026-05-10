import { colors } from './colors';

export function getDayTypeStyle(dayType: string): { label: string; color: string; emoji: string } {
  switch (dayType) {
    case 'fyp':
      return { label: 'FYP Day', color: colors.fyp, emoji: '🎓' };
    case 'review':
      return { label: 'Review Day', color: colors.review, emoji: '🔄' };
    case 'deep_work':
      return { label: 'Deep Work', color: colors.development, emoji: '🛠' };
    case 'outreach':
      return { label: 'Outreach Day', color: colors.clients, emoji: '📣' };
    case 'content':
      return { label: 'Content Day', color: colors.content, emoji: '✍️' };
    default:
      return { label: 'Work Day', color: colors.grey600, emoji: '💼' };
  }
}

export function getSprintProgress(startDate: string, durationDays: number): number {
  const start = new Date(startDate).getTime();
  const now = new Date().getTime();
  const elapsed = Math.floor((now - start) / 86400000);
  return Math.min(Math.round((elapsed / durationDays) * 100), 100);
}

export function getDayNumber(startDate: string): number {
  const start = new Date(startDate).getTime();
  const now = new Date().getTime();
  return Math.max(1, Math.floor((now - start) / 86400000) + 1);
}

export function formatGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
