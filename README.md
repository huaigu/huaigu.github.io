# huaigu · Alex Wang

A static personal portfolio and complete public GitHub repository browser. This redesign is proposed on `codex/portfolio-redesign-review-2026-10-01`; merging/replacing the live GitHub Pages site requires Alex's review.

## Preview

Open `index.html` directly, or serve the repository with `python -m http.server 8765`. The homepage works without a build, external fonts, analytics, a server API, or GitHub credentials. Repository data is embedded for offline browsing. Existing articles use their original root-relative asset paths and work when served from the repository root.

## What's here

- Responsive, original portfolio design with a pointer-responsive canvas sphere, a pause control, and reduced-motion support.
- Four README-grounded featured projects plus two related experiments.
- All 194 public repositories captured on October 1, 2026: 41 source repositories and 153 forks. Counts describe GitHub's fork flag, not original authorship.
- Search, topic/type/language filters, sorting, pagination, empty states, and a `/` search shortcut.
- The original four Solidity articles, archives, tags, old assets, and `CNAME` remain unchanged.

## Refresh repository data

Run `node scripts/refresh-repos.mjs` with Node 18 or newer. The script paginates the public GitHub API, validates owner/visibility and URLs, and updates both `assets/portfolio/repos.json` and the embedded JSON in `index.html`. An optional `GITHUB_TOKEN` can raise API limits; it is read only by this maintenance script and never embedded in the site. Review the resulting diff before committing. This is a manual snapshot, not an automatic update service.

Topic categories are editorial heuristics, and projects can belong to several. A GitHub source repository may still contain adapted, copied, or template code. Featured descriptions reflect repository documentation rather than independent production-readiness verification.

## Content sources

- Identity: public GitHub account/repository history; `huaigu/huaigu` profile; project READMEs corroborate Bojack/0xbojack.
- Features: `huaigu/laya-article-examples`, `huaigu/fhevm-sdk`, `huaigu/GradMark-AI`, `huaigu/number-verse-arena`.
- Related experiments: `huaigu/fhevm-treasure-hunt`, `huaigu/LuckLens`.
- Writing: existing GitHub Pages articles, preserved in place.
- Design research: [Anthony Fu](https://antfu.me/), [Paco Coursey](https://paco.me/), [Lee Robinson](https://leerob.com/), and [Jhey Tompkins](https://www.jhey.dev/). Used for storytelling/structure inspiration; no code or assets copied.

Public-only data is included. No private repository information, employment/location claims, invented outcomes, or contact details from account authentication are published.

## Deployment after approval

Review the isolated branch/PR. On approval, merge into the existing `master` publishing branch using the repository's existing GitHub Pages setup. This change does not modify domain configuration, GitHub Pages settings, workflows, or access permissions. The repository currently contains generated static output; if an external Hexo deployment regenerates `index.html`, update that source/deployment process before publishing this redesign.
