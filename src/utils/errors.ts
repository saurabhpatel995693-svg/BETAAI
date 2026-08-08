// Standardized user-friendly error handler for SHESHAAI platform

export interface FriendlyError {
  title: string;
  message: string;
  actionTip: string;
  icon: string;
}

export function formatUserFriendlyError(err: any): FriendlyError {
  const rawMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err || '');

  // 1. Invalid or missing API key
  if (
    rawMsg.includes('API key') ||
    rawMsg.includes('api key') ||
    rawMsg.includes('API_KEY') ||
    rawMsg.includes('401') ||
    rawMsg.includes('403') ||
    rawMsg.includes('unauthorized') ||
    rawMsg.includes('invalid key')
  ) {
    return {
      icon: '🔑',
      title: 'API Key Problem',
      message: 'Apka Gemini API key invalid ya missing lag raha hai.',
      actionTip: 'Upar header mein "AI Engine" ya "API Key" section par click karke apna sahi Gemini API Key set karein.'
    };
  }

  // 2. Rate limit / Quota exceeded
  if (
    rawMsg.includes('429') ||
    rawMsg.includes('rate') ||
    rawMsg.includes('limit') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('Too Many Requests')
  ) {
    return {
      icon: '⏳',
      title: 'Rate Limit Exceeded',
      message: 'Server pool par abhi bahut saare requests aaye hain.',
      actionTip: '2-3 minute ruk kar dobara try karein, ya apna custom Gemini API Key add karke unlimited access paayein.'
    };
  }

  // 3. Daily guest limit reached
  if (rawMsg.includes('daily limit') || rawMsg.includes('guest limit')) {
    return {
      icon: '📊',
      title: 'Daily Guest Quota Reached',
      message: 'Aaj ke 10 free guest generations poore ho chuke hain.',
      actionTip: 'Unlimited generations ke liye apna free Google Gemini API Key enter karein (header me 🔑 icon par click karein).'
    };
  }

  // 4. Server error / Timeout
  if (
    rawMsg.includes('500') ||
    rawMsg.includes('502') ||
    rawMsg.includes('503') ||
    rawMsg.includes('504') ||
    rawMsg.includes('timeout') ||
    rawMsg.includes('Timed out') ||
    rawMsg.includes('NetworkError') ||
    rawMsg.includes('Failed to fetch')
  ) {
    return {
      icon: '🛠️',
      title: 'Server Temporarily Busy',
      message: 'AI backend temporarily process nahi kar paya.',
      actionTip: 'Internet connection check karein aur ek baar dobara Try Again button press karein.'
    };
  }

  // 5. Default fallback
  return {
    icon: '💡',
    title: 'Processing Issue',
    message: rawMsg.length < 120 && !rawMsg.includes('{') ? rawMsg : 'Request complete karne me dikkat aayi.',
    actionTip: 'Kripya topic/prompt check karke dobara try karein.'
  };
}
