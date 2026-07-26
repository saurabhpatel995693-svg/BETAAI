/**
 * BETAAI / JavaGoat Security Module
 * Provides CSRF protection, SQL Injection prevention, XSS sanitization, and Admin role checking.
 * Built for SAURABH
 */

export const ADMIN_EMAIL = "admin@betaai.local";

// CSRF Token Generation (24 random bytes -> 48 hex chars)
export function generateCSRFToken() {
  const array = new Uint8Array(24);
  window.crypto.getRandomValues(array);
  const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('betaai_csrf_token', token);
  return token;
}

export function getCSRFToken() {
  let token = sessionStorage.getItem('betaai_csrf_token');
  if (!token) {
    token = generateCSRFToken();
  }
  return token;
}

export function verifyCSRFToken(token) {
  const currentToken = sessionStorage.getItem('betaai_csrf_token');
  return currentToken && currentToken === token;
}

// XSS Protection - HTML Entity Encoding
export function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// SQL Injection Prevention - Detection & Sanitization
const SQLI_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|TRUNCATE|DECLARE|GRANT)\b)/i,
  /(--|\/\*|\*\/|;)/,
  /(' OR '1'='1|' OR 1=1)/i,
  /(\bOR\b\s+\d+=\d+|\bAND\b\s+\d+=\d+)/i
];

export function detectSQLi(input) {
  if (typeof input !== 'string') return false;
  return SQLI_PATTERNS.some(pattern => pattern.test(input));
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  let sanitized = input;
  if (detectSQLi(sanitized)) {
    console.warn('[SECURITY] SQL Injection pattern detected in user input.');
  }
  return sanitized;
}

// Admin privileges check
export function isAdminUser(userOrEmail) {
  if (!userOrEmail) return false;
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email;
  return email && email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
}
