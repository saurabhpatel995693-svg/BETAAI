// Daily Quota Manager for SHESHAAI platform
// Guests get 10 free generations per calendar day.
// Users with custom Gemini API Key get UNLIMITED access.

const DAILY_FREE_LIMIT = 10;
const STORAGE_KEY = 'sheshaai_daily_usage';

interface UsageRecord {
  date: string;
  count: number;
}

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCustomKey(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('GEMINI_API_KEY') ||
    localStorage.getItem('sheshaai_user_key') ||
    localStorage.getItem('sheshaai_gemini_key') ||
    localStorage.getItem('betaai_custom_key') ||
    ''
  ).trim();
}

export function isUnlimitedUser(): boolean {
  return getCustomKey().length > 0;
}

export function getUsageRecord(): UsageRecord {
  if (typeof window === 'undefined') return { date: getTodayString(), count: 0 };
  const today = getTodayString();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: UsageRecord = JSON.parse(raw);
      if (parsed.date === today) {
        return parsed;
      }
    }
  } catch {}
  return { date: today, count: 0 };
}

export function getRemainingQuota(): number {
  if (isUnlimitedUser()) return Infinity;
  const record = getUsageRecord();
  return Math.max(0, DAILY_FREE_LIMIT - record.count);
}

export function hasRemainingQuota(): boolean {
  if (isUnlimitedUser()) return true;
  return getRemainingQuota() > 0;
}

export function incrementUsage(): number {
  if (isUnlimitedUser() || typeof window === 'undefined') return Infinity;
  const record = getUsageRecord();
  record.count += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  window.dispatchEvent(new Event('quota-updated'));
  return Math.max(0, DAILY_FREE_LIMIT - record.count);
}
