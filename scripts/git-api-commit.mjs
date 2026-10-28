// 当 github.com:443 不通（api.github.com 通）时，用 GitHub REST API 提交文件
// 用法：GITHUB_TOKEN=xxx node scripts/git-api-commit.mjs "<commit message>" <file1> [file2...]
import { readFileSync } from 'node:fs';

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'Rikka3835/candied-ruin';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const [msg, ...files] = process.argv.slice(2);

if (!TOKEN || !msg || files.length === 0) {
  console.error('usage: GITHUB_TOKEN=... node scripts/git-api-commit.mjs "<msg>" <file...>');
  process.exit(2);
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'candied-ruin-publisher',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

const ref = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
const baseSha = ref.object.sha;
const baseCommit = await api(`/repos/${REPO}/git/commits/${baseSha}`);

const tree = [];
for (const f of files) {
  const content = readFileSync(f);
  const blob = await api(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }),
  });
  tree.push({ path: f.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha });
  console.log(`blob ${f} -> ${blob.sha.slice(0, 8)} (${content.length}B)`);
}

const newTree = await api(`/repos/${REPO}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
});

const commit = await api(`/repos/${REPO}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({ message: msg, tree: newTree.sha, parents: [baseSha] }),
});

await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
  method: 'PATCH',
  body: JSON.stringify({ sha: commit.sha, force: false }),
});

console.log(JSON.stringify({ repo: REPO, branch: BRANCH, commit: commit.sha, files: files.length }, null, 2));
