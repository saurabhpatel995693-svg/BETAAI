import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPOS = [
  { owner: 'Shubhamsaboo', repo: 'awesome-llm-apps', label: 'Awesome LLM Apps' },
  { owner: 'browser-use', repo: 'browser-use', label: 'Browser Use' },
  { owner: 'getmaxun', repo: 'maxun', label: 'Maxun' }
];

async function fetchRepoReadme(owner, repo) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Try master branch if main doesn't exist
      const fallbackUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`;
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`);
      return await fallbackRes.text();
    }
    return await res.text();
  } catch (err) {
    console.error(`Error fetching README for ${owner}/${repo}:`, err.message);
    return `Failed to load documentation for ${owner}/${repo}.`;
  }
}

async function main() {
  console.log('[Knowledge Base] Starting fetch of repository documentation...');
  const knowledgeBase = {};

  for (const item of REPOS) {
    console.log(`[Knowledge Base] Fetching README for ${item.owner}/${item.repo}...`);
    const readme = await fetchRepoReadme(item.owner, item.repo);
    // Limit text length to prevent context overflow but keep critical info
    knowledgeBase[item.repo] = {
      label: item.label,
      owner: item.owner,
      repo: item.repo,
      url: `https://github.com/${item.owner}/${item.repo}`,
      documentation: readme.substring(0, 15000) // Top 15k characters of documentation
    };
  }

  const outputPath = path.join(__dirname, 'public', 'repo-knowledge.json');
  fs.writeFileSync(outputPath, JSON.stringify(knowledgeBase, null, 2), 'utf-8');
  console.log(`[Knowledge Base] Successfully created repo-knowledge.json at: ${outputPath}`);
}

main().catch(console.error);
