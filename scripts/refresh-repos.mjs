#!/usr/bin/env node
/**
 * Refresh every public repository owned by huaigu, including forks.
 * Requires Node.js 18+. Run: node scripts/refresh-repos.mjs
 * GITHUB_TOKEN is optional and used only by this maintenance script.
 * Source means GitHub's fork=false flag, not a claim of original authorship.
 * Categories are editorial, overlapping heuristics based on public metadata.
 */
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const owner = 'huaigu';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = resolve(root, 'assets/portfolio/repos.json');
const indexPath = resolve(root, 'index.html');
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'huaigu-public-portfolio-refresh' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

export function categorize(repository) {
  const text = `${repository.name} ${repository.description || ''} ${(repository.topics || []).join(' ')}`.toLowerCase();
  const categories = [];
  if (/\b(ai|llm|gpt|agent|agents|chatgpt|claude|qwen|ollama|rag|openclaw|hermes|diffusion|machine.learning|deep.learning|transformers|langchain|mcp|anthropic)\b|人工智能|大模型|智能体|智能助手/.test(text)) categories.push('ai');
  if (/\b(web3|ethereum|solidity|blockchain|nft|nfts|defi|erc\d*|crypto|wallet|metamask|solana|smart.?contracts?|polygon|onchain|reth|irys|flow|okx|opensea|hardhat|foundry|wagmi)\b|区块链|智能合约|以太坊|钱包/.test(text)) categories.push('web3');
  if (/\b(design|creative|art|drawing|sketch|image|images|video|music|animation|animate|svg|canvas|diffusion|midjourney|spline|threejs|three\.js|portfolio|game|games)\b|绘画|图像|设计|游戏|视频/.test(text)) categories.push('creative');
  if (/\b(tool|tools|toolset|cli|sdk|api|framework|library|utilities|utility|automation|workflow|server|terminal|editor|builder|parser|scraper|simulator)\b|工具|脚本/.test(text) || !categories.length) categories.push('tools');
  return categories;
}

export function snapshot(repositories, fetchedAt = new Date().toISOString()) {
  const entries = repositories.map(repository => ({
    id: repository.id,
    name: repository.name,
    full_name: repository.full_name,
    html_url: repository.html_url,
    description: repository.description,
    fork: Boolean(repository.fork),
    created_at: repository.created_at,
    updated_at: repository.updated_at,
    pushed_at: repository.pushed_at,
    homepage: repository.homepage,
    size: repository.size,
    stargazers_count: repository.stargazers_count,
    language: repository.language,
    forks_count: repository.forks_count,
    archived: Boolean(repository.archived),
    topics: repository.topics || [],
    visibility: 'public',
    default_branch: repository.default_branch,
    has_pages: Boolean(repository.has_pages),
    categories: categorize(repository),
  }));
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return {
    owner,
    fetched_at: fetchedAt,
    source: 'GitHub public REST API: GET /users/huaigu/repos?type=owner&per_page=100, all pages',
    category_note: 'Editorial discovery categories inferred from repository names, descriptions and topics; categories may overlap.',
    public_repo_count: entries.length,
    source_repo_count: entries.filter(repository => !repository.fork).length,
    fork_repo_count: entries.filter(repository => repository.fork).length,
    repositories: entries,
  };
}

async function refresh() {
  const repositories = [];
  const ids = new Set();
  let page = 1;
  for (;;) {
    const url = `https://api.github.com/users/${owner}/repos?type=owner&per_page=100&sort=full_name&direction=asc&page=${page}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`GitHub request failed (${response.status}) on page ${page}. Existing snapshot preserved.`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub response. Existing snapshot preserved.');
    for (const repository of batch) {
      if (repository.private !== false || repository.visibility !== 'public' || repository.owner?.login?.toLowerCase() !== owner || repository.full_name?.toLowerCase() !== `${owner}/${repository.name}`.toLowerCase()) {
        throw new Error('Unexpected repository visibility or owner. Existing snapshot preserved.');
      }
      if (ids.has(repository.id)) throw new Error('Duplicate repository while paging. Retry the refresh; existing snapshot preserved.');
      ids.add(repository.id);
      repositories.push(repository);
    }
    if (!response.headers.get('link')?.includes('rel="next"')) break;
    if (!batch.length || page >= 100) throw new Error('Invalid pagination. Existing snapshot preserved.');
    page += 1;
  }
  if (!repositories.length) throw new Error('Empty repository response. Existing snapshot preserved.');

  const data = snapshot(repositories);
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const index = await readFile(indexPath, 'utf8');
  // Escape '<' so a repository description cannot terminate the JSON script.
  const embedded = JSON.stringify(data).replace(/</g, '\\u003c');
  const marker = /(<script\b(?=[^>]*\bid=["']repo-data["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>)[\s\S]*?(<\/script>)/i;
  if (!marker.test(index)) throw new Error('Missing repo-data JSON script in index.html. Existing snapshot preserved.');
  const updatedIndex = index.replace(marker, (_match, opening, closing) => `${opening}${embedded}${closing}`);

  // All pages and both complete payloads are validated before writing. Each
  // destination is replaced atomically, so interrupted writes cannot truncate it.
  await mkdir(dirname(target), { recursive: true });
  const suffix = `.tmp-${process.pid}-${Date.now()}`;
  const jsonTemporary = `${target}${suffix}`;
  const indexTemporary = `${indexPath}${suffix}`;
  try {
    await writeFile(jsonTemporary, json, { flag: 'wx' });
    await writeFile(indexTemporary, updatedIndex, { flag: 'wx' });
    await rename(jsonTemporary, target);
    await rename(indexTemporary, indexPath);
  } finally {
    await Promise.allSettled([unlink(jsonTemporary), unlink(indexTemporary)]);
  }
  console.log(`Updated ${data.public_repo_count} public repositories (${data.source_repo_count} source, ${data.fork_repo_count} forks).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refresh().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
