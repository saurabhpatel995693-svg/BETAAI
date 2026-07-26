/**
 * BETAAI / JavaGoat Storage & Conversation Management System
 * Handles localStorage persistence, date grouping, conversation filtering, and Notebooks document management.
 * Created for SAURABH
 */

export const STORAGE_KEYS = {
  CONVERSATIONS: 'betaai_conversations',
  CURRENT_CONVERSATION_ID: 'betaai_current_conv_id',
  LOCAL_SETTINGS: 'betaai_local_settings',
  NOTEBOOKS: 'betaai_notebooks',
  THEME: 'betaai_theme',
  LOW_DATA_MODE: 'betaai_low_data'
};

// Date Grouping Helper
export function groupConversationsByDate(conversations) {
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: []
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const thisWeekStart = todayStart - (86400000 * 7);

  conversations.forEach(conv => {
    const updatedAt = new Date(conv.updatedAt || conv.createdAt || Date.now()).getTime();
    if (updatedAt >= todayStart) {
      groups.today.push(conv);
    } else if (updatedAt >= yesterdayStart) {
      groups.yesterday.push(conv);
    } else if (updatedAt >= thisWeekStart) {
      groups.thisWeek.push(conv);
    } else {
      groups.older.push(conv);
    }
  });

  return groups;
}

// Auto-generate Title (40 chars + ellipsis)
export function generateConversationTitle(firstMessage) {
  if (!firstMessage) return 'New Conversation';
  let cleaned = firstMessage.trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (cleaned.length > 40) {
    return cleaned.substring(0, 40) + '...';
  }
  return cleaned;
}

// Conversation Storage API
export function loadConversations() {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('[STORAGE] Error parsing conversations:', e);
    return [];
  }
}

export function saveConversations(conversations) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
}

export function createNewConversation() {
  const newConv = {
    id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title: 'New Chat',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const convs = loadConversations();
  convs.unshift(newConv);
  saveConversations(convs);
  localStorage.setItem(STORAGE_KEYS.CURRENT_CONVERSATION_ID, newConv.id);
  return newConv;
}

export function getConversationById(id) {
  const convs = loadConversations();
  return convs.find(c => c.id === id) || null;
}

export function saveMessageToConversation(convId, message) {
  const convs = loadConversations();
  let index = convs.findIndex(c => c.id === convId);

  if (index === -1) {
    const newConv = {
      id: convId || ('conv_' + Date.now()),
      title: generateConversationTitle(message.content),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    convs.unshift(newConv);
    index = 0;
  }

  const conv = convs[index];
  conv.messages.push(message);
  conv.updatedAt = new Date().toISOString();

  // If this is the first user message, generate conversation title
  if (conv.messages.length === 1 && message.role === 'user') {
    conv.title = generateConversationTitle(message.content);
  }

  saveConversations(convs);
  return conv;
}

export function deleteConversation(id) {
  let convs = loadConversations();
  convs = convs.filter(c => c.id !== id);
  saveConversations(convs);
  const currentId = localStorage.getItem(STORAGE_KEYS.CURRENT_CONVERSATION_ID);
  if (currentId === id) {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_CONVERSATION_ID);
  }
}

export function clearAllConversations() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS);
  localStorage.removeItem(STORAGE_KEYS.CURRENT_CONVERSATION_ID);
}

// Notebooks Document Storage
export function loadNotebooks() {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.NOTEBOOKS);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    return [];
  }
}

export function saveNotebookDocument(doc) {
  const notebooks = loadNotebooks();
  const existingIndex = notebooks.findIndex(n => n.name === doc.name);
  if (existingIndex >= 0) {
    notebooks[existingIndex] = doc;
  } else {
    notebooks.unshift(doc);
  }
  localStorage.setItem(STORAGE_KEYS.NOTEBOOKS, JSON.stringify(notebooks));
  return notebooks;
}

export function deleteNotebookDocument(id) {
  let notebooks = loadNotebooks();
  notebooks = notebooks.filter(n => n.id !== id);
  localStorage.setItem(STORAGE_KEYS.NOTEBOOKS, JSON.stringify(notebooks));
  return notebooks;
}
