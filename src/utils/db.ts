// Unified Database Interface for Viblo Clone
// Provides SSR static fallbacks and Client-side LocalStorage state persistence

export interface User {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  reputation: number;
  followers: number;
  following: number;
  avatarColor: string; // e.g. "bg-gradient-develop-start"
}

export interface Post {
  id: string;
  title: string;
  content: string;
  tags: string[];
  authorId: string;
  views: number;
  likes: string[]; // List of userIds who liked
  bookmarks: string[]; // List of userIds who bookmarked
  createdAt: string;
  commentsCount: number;
  readTime: string;
  trending: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  createdAt: string;
  likes: string[];
}

export interface Question {
  id: string;
  title: string;
  content: string;
  tags: string[];
  authorId: string;
  views: number;
  votes: number;
  votedUserIds: Record<string, 'up' | 'down'>; // userId -> vote direction
  resolved: boolean;
  createdAt: string;
  answersCount: number;
}

export interface Answer {
  id: string;
  questionId: string;
  authorId: string;
  content: string;
  votes: number;
  votedUserIds: Record<string, 'up' | 'down'>;
  correct: boolean;
  createdAt: string;
}

export interface Translation {
  id: string;
  title: string;
  content: string;
  originalUrl: string;
  targetLang: string;
  authorId: string;
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  posts: Post[];
  comments: Comment[];
  questions: Question[];
  answers: Answer[];
  translations: Translation[];
}

// Initial Mock Database
export const MOCK_USERS: User[] = [
  {
    id: "user-1",
    username: "alex_dev",
    displayName: "Alex Nguyen",
    bio: "Senior Frontend Engineer & Open Source enthusiast. Building things with Astro, TypeScript, and AI.",
    reputation: 1540,
    followers: 128,
    following: 75,
    avatarColor: "from-[#007cf0] to-[#00dfd8]"
  },
  {
    id: "user-2",
    username: "linh_tech",
    displayName: "Linh Tran",
    bio: "AI researcher & technical translator. Passionate about LLMs, prompt engineering, and deep learning.",
    reputation: 920,
    followers: 84,
    following: 110,
    avatarColor: "from-[#7928ca] to-[#ff0080]"
  },
  {
    id: "user-3",
    username: "john_doe",
    displayName: "John Doe",
    bio: "Full Stack Developer. Writing bugs by day, debugging them by night.",
    reputation: 430,
    followers: 32,
    following: 15,
    avatarColor: "from-[#ff4d4d] to-[#f9cb28]"
  }
];

export const MOCK_POSTS: Post[] = [
  {
    id: "post-1",
    title: "Tailwind CSS v4.0: Deep Dive into the CSS-First Configuration",
    content: `Tailwind CSS v4.0 is a complete overhaul of the framework. One of the biggest changes is the transition to a **CSS-first configuration**. In v3, we managed theme configurations in \`tailwind.config.js\`. In v4, we define everything directly in our stylesheet using the \`@theme\` directive!

### Why CSS-First?
CSS variables (custom properties) are natively understood by the browser. By letting Tailwind generate classes based on custom CSS variables, the framework integrates perfectly with standard tooling and eliminates the need for expensive JS parse-and-build steps.

Here is how you customize colors in your entrypoint:
\`\`\`css
@import "tailwindcss";

@theme {
  --color-primary: #171717;
  --color-brand-blue: #0070f3;
}
\`\`\`

You can then use them directly in HTML:
\`\`\`html
<div class="bg-primary text-brand-blue">
  Tailwind v4 is incredibly fast!
</div>
\`\`\`

### Performance Boost
Because Tailwind v4 is powered by a new compiler built in Rust (with lightning-fast parsing), build times are reduced by up to 10x. It also does not require PostCSS or Autoprefixer by default when using the Vite plugin.

What do you think about this new CSS-first direction? Let me know in the comments!`,
    tags: ["TailwindCSS", "CSS", "Vite", "Frontend"],
    authorId: "user-1",
    views: 1240,
    likes: ["user-2", "user-3"],
    bookmarks: ["user-2"],
    createdAt: "2026-06-28T09:30:00Z",
    commentsCount: 3,
    readTime: "4 min read",
    trending: true
  },
  {
    id: "post-2",
    title: "Building High-Performance Websites with Astro 5 Islands Architecture",
    content: `Astro is built around a simple yet powerful idea: **Islands Architecture**. Most of your page is static HTML. Only the interactive elements (such as charts, search boxes, or checkout buttons) are loaded as client-side JavaScript.

### How Islands Work
In Astro, you import components from any frontend framework (React, Svelte, Vue, etc.) and specify *when* they should hydrate:

- \`<MyComponent />\` - Renders as static HTML. No JavaScript is shipped!
- \`<MyComponent client:load />\` - Hydrates as soon as the page loads.
- \`<MyComponent client:visible />\` - Hydrates when the component enters the viewport. Great for heavy widgets below the fold.

### Hybrid Rendering
With Astro 5, you can seamlessly mix Static Site Generation (SSG) and Server-Side Rendering (SSR) in the same project using the default hybrid mode. This is extremely useful for technical blogs where post pages can be static, but pages like dashboards or AI chats can be dynamic!

Let us look at a simple Astro component structure:
\`\`\`astro
---
// src/components/Header.astro
const { title } = Astro.props;
---
<header class="border-b border-hairline py-4">
  <h1 class="text-display-sm">{title}</h1>
</header>
\`\`\`

It is clean, leverages standard HTML, and helps you achieve 100/100 Lighthouse scores effortlessly.`,
    tags: ["Astro", "Performance", "WebDev", "React"],
    authorId: "user-1",
    views: 980,
    likes: ["user-2"],
    bookmarks: [],
    createdAt: "2026-06-29T14:15:00Z",
    commentsCount: 2,
    readTime: "5 min read",
    trending: true
  },
  {
    id: "post-3",
    title: "[Translation] The Rust Borrow Checker Guide for Beginners",
    content: `This is a translation of the classic guide detailing memory safety in Rust without a garbage collector.

### Understanding Ownership and Borrowing
In Rust, memory is managed through a system of ownership with a set of rules that the compiler checks at compile time.

1. **Each value in Rust has an owner.**
2. **There can only be one owner at a time.**
3. **When the owner goes out of scope, the value is dropped.**

### Borrowing Rules
When you want to access a value without taking ownership, you borrow it.
- You can have any number of immutable references (\`&T\`).
- You can have exactly one mutable reference (\`&mut T\`).
- You **cannot** have both at the same time.

This prevents **data races** at compile time! No more segmentation faults or double frees.`,
    tags: ["Rust", "Systems", "Translation", "MemorySafety"],
    authorId: "user-2",
    views: 450,
    likes: ["user-1", "user-3"],
    bookmarks: ["user-1"],
    createdAt: "2026-06-30T08:00:00Z",
    commentsCount: 1,
    readTime: "6 min read",
    trending: false
  }
];

export const MOCK_COMMENTS: Comment[] = [
  {
    id: "comment-1",
    postId: "post-1",
    parentId: null,
    authorId: "user-2",
    content: "Awesome writeup! I love the move away from JSON config files. Having the config in the CSS file makes custom variables feel natural and lets IDEs autocomplete them cleanly.",
    createdAt: "2026-06-28T10:15:00Z",
    likes: ["user-1"]
  },
  {
    id: "comment-2",
    postId: "post-1",
    parentId: "comment-1",
    authorId: "user-1",
    content: "Thanks Linh! Exactly, the IDE support for CSS variables is already excellent, so piggybacking on that was a smart move by Tailwind Labs.",
    createdAt: "2026-06-28T10:45:00Z",
    likes: []
  },
  {
    id: "comment-3",
    postId: "post-1",
    parentId: null,
    authorId: "user-3",
    content: "Is there any compatibility issue when integrating it with standard PostCSS plugins? I heard v4 bypasses PostCSS.",
    createdAt: "2026-06-28T12:00:00Z",
    likes: []
  }
];

export const MOCK_QUESTIONS: Question[] = [
  {
    id: "question-1",
    title: "How to fix hydration mismatch error in Astro when nesting components?",
    content: `I am building an interactive comment system in Astro. I have a React component \`<CommentSection client:load />\` nested inside an Astro page. Inside it, I import some client-only library that prints current timestamps.

When the page loads, I get this error in console:
\`\`\`
Warning: Expected server HTML to contain a matching <div> in <div>.
\`\`\`

Why does this happen and how do I prevent it? Any help is appreciated!`,
    tags: ["Astro", "React", "Hydration", "Frontend"],
    authorId: "user-3",
    views: 320,
    votes: 5,
    votedUserIds: { "user-1": "up", "user-2": "up" },
    resolved: true,
    createdAt: "2026-06-29T10:00:00Z",
    answersCount: 1
  },
  {
    id: "question-2",
    title: "What is the differences between Map and Object in JavaScript regarding performance?",
    content: `I am writing a local storage cache and I need to store millions of key-value pairs in memory.
Should I use a plain JavaScript object \`{}\` or the \`Map\` constructor? What are the key performance differences in search, insertion, and deletion?`,
    tags: ["JavaScript", "Performance", "DataStructures"],
    authorId: "user-1",
    views: 180,
    votes: 3,
    votedUserIds: { "user-2": "up" },
    resolved: false,
    createdAt: "2026-06-30T16:20:00Z",
    answersCount: 1
  }
];

export const MOCK_ANSWERS: Answer[] = [
  {
    id: "answer-1",
    questionId: "question-1",
    authorId: "user-1",
    content: `Hydration mismatch errors happen when the HTML generated on the server does **not match** the initial HTML generated in the browser during client-side hydration.

Because the server renders the page at, say, \`10:00:00\`, and your client component hydrates at \`10:00:01\`, the timestamps do not match, causing React to throw a warning.

### Solution: Use Client-Only Lifecycle Methods
Ensure that elements that generate dynamic browser-only content (like timestamps, window dimensions, or localStorage states) only render **after** the component has mounted.

In React, you can do this with a \`mounted\` flag:
\`\`\`jsx
import { useEffect, useState } from 'react';

export default function MyComponent() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div class="loading">Loading...</div>; // Plain placeholder matches server HTML
  }

  return <div>Loaded at: {new Date().toLocaleTimeString()}</div>;
}
\`\`\`

Alternatively, in Astro you can force the component to compile client-side only (bypassing SSR rendering entirely) using:
\`\`\`astro
<ReactComponent client:only="react" />
\`\`\`
This will skip server rendering and render the component entirely in the browser, eliminating any hydration mismatch warnings.`,
    votes: 8,
    votedUserIds: { "user-2": "up", "user-3": "up" },
    correct: true,
    createdAt: "2026-06-29T11:30:00Z"
  },
  {
    id: "answer-2",
    questionId: "question-2",
    authorId: "user-2",
    content: `Here is a summary of the performance differences:

1. **Key Types**: Plain objects only allow Strings and Symbols. \`Map\` allows keys of *any* type (objects, functions, primitives).
2. **Key Ordering**: Maps maintain insertion order. Object keys are ordered based on specific, complex rules (integers first, then strings in insertion order).
3. **Performance**:
   - **Insertion**: \`Map\` is optimized for frequent insertions and deletions, outperforming Objects at scale.
   - **Lookup**: For smaller datasets, Objects can be faster due to engine optimization, but Maps are more consistent for dynamic workloads.
4. **Size**: You can easily retrieve the size of a \`Map\` in O(1) via \`map.size\`, while for Objects you must call \`Object.keys(obj).length\` which is O(N).

If you are caching millions of items, **use a \`Map\`**. It behaves much better under heavy insertion/deletion stresses.`,
    votes: 4,
    votedUserIds: { "user-1": "up" },
    correct: false,
    createdAt: "2026-06-30T17:00:00Z"
  }
];

export const MOCK_TRANSLATIONS: Translation[] = [
  {
    id: "trans-1",
    title: "[Vietnamese] Deep Dive into Transformers Model Architecture",
    content: `Bản dịch chi tiết của bài viết kinh điển "Attention Is All You Need".
Mô hình Transformer loại bỏ hoàn toàn các mạng hồi quy (RNN) và chập (CNN), thay thế chúng bằng cơ chế tự chú ý (Self-Attention)...`,
    originalUrl: "https://arxiv.org/abs/1706.03762",
    targetLang: "Vietnamese",
    authorId: "user-2",
    createdAt: "2026-06-30T10:00:00Z"
  }
];

// Helper to get raw DB structure
const DEFAULT_DB: DatabaseSchema = {
  users: MOCK_USERS,
  posts: MOCK_POSTS,
  comments: MOCK_COMMENTS,
  questions: MOCK_QUESTIONS,
  answers: MOCK_ANSWERS,
  translations: MOCK_TRANSLATIONS
};

// Client-safe LocalStorage helper
export function getDb(): DatabaseSchema {
  if (typeof window === 'undefined') {
    return DEFAULT_DB;
  }
  
  const saved = localStorage.getItem('viblo_db');
  if (!saved) {
    localStorage.setItem('viblo_db', JSON.stringify(DEFAULT_DB));
    return DEFAULT_DB;
  }
  
  try {
    return JSON.parse(saved);
  } catch (e) {
    return DEFAULT_DB;
  }
}

export function saveDb(db: DatabaseSchema): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('viblo_db', JSON.stringify(db));
  }
}

// User helper
export function getCurrentUser(): User {
  const db = getDb();
  // Simply mock user-1 as the current logged-in user
  let current = db.users.find(u => u.username === 'alex_dev');
  if (!current) {
    current = MOCK_USERS[0];
  }
  return current;
}

export function updateCurrentUserProfile(displayName: string, bio: string): User {
  const db = getDb();
  const currentUser = getCurrentUser();
  const updatedUsers = db.users.map(u => {
    if (u.id === currentUser.id) {
      return { ...u, displayName, bio };
    }
    return u;
  });
  db.users = updatedUsers;
  saveDb(db);
  return { ...currentUser, displayName, bio };
}
