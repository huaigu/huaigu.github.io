# huaigu · Alex Wang

A static personal portfolio and complete public GitHub repository browser, published at [huaigu.github.io](https://huaigu.github.io/).

## Preview

Open `index.html` directly, or serve the repository with `python -m http.server 8765`. The homepage works without a build, external fonts, analytics, a server API, or GitHub credentials. Repository data is embedded for offline browsing. Existing articles use their original root-relative asset paths and work when served from the repository root.

## What's here

- English by default with an English / 中文 language switch. A visitor's explicit choice is remembered locally; browser language does not override the default. Portfolio copy and interface controls are translated, while repository names, programming languages, and upstream descriptions retain their source text.

- Responsive, light-theme portfolio with an interactive technology lab: particle transitions between AI routing, private compute, and real-time shared-state diagrams, grounded in actual project technologies.
- A keyboard-accessible “Send a pulse” interaction adds ripples to the hero particle field; orbital trails, privacy rings, and a connected multiplayer mesh illustrate the selected theme.
- A bilingual typewriter cycles through project themes, a wide technology ticker moves beneath the hero, and masked words and artwork curtains make scroll entrances clearly visible. Pause, reduced-motion, hidden-page, and offscreen behavior also cover these effects.
- Scroll-driven depth makes project illustrations drift, rotate, and gently scale as you move through the page, with chapter progress rails and staggered detail entrances. Native scrolling remains unchanged; mobile movement is lighter.
- Project-specific motion, fine-pointer card tilt and lighting, staged entrances, repository-result reveals, and a reading-progress line. The global motion control pauses the canvas and all decorative loops; reduced-motion preferences and offscreen pausing are respected. No animation dependencies or live-metric claims.
- Five selected projects: ShelbyFans, UpDown60, NumberVerse Arena, ProofQuest, and Neon Snake Glitch Arena.
- A dedicated Applied AI section introduces Laya in English and Chinese.
- All 194 public repositories captured on October 1, 2026: 41 source repositories and 153 forks. Counts describe GitHub's fork flag, not original authorship.
- Search, topic/type/language filters, sorting, pagination, empty states, and a `/` search shortcut.
- The original four Solidity articles, archives, tags, and old assets are preserved. The obsolete `blog.only1.club` custom domain was removed at the owner’s request.

## Refresh repository data

Run `node scripts/refresh-repos.mjs` with Node 18 or newer. The script paginates the public GitHub API, validates owner/visibility and URLs, and updates both `assets/portfolio/repos.json` and the embedded JSON in `index.html`. An optional `GITHUB_TOKEN` can raise API limits; it is read only by this maintenance script and never embedded in the site. Review the resulting diff before committing. This is a manual snapshot, not an automatic update service.

Topic categories are editorial heuristics, and projects can belong to several. A GitHub source repository may still contain adapted, copied, or template code. Featured descriptions reflect repository documentation rather than independent production-readiness verification.

## Content sources

- Identity: public GitHub account/repository history; `huaigu/huaigu` profile; project READMEs corroborate Bojack/0xbojack.
- Features: `huaigu/ShelbyFans`, `huaigu/UpDown60`, `huaigu/number-verse-arena`, `huaigu/proofquest-web3-adventures`, `huaigu/neon-snake-glitch-arena`.
- Applied AI: `huaigu/laya-article-examples`.
- Writing: new AI and engineering articles live in `articles/` as public Markdown, with static reading pages at `/writing/`. The original Solidity articles are preserved at their existing URLs.
- Animation references found with Exa: [Typed.js](https://mattboldt.github.io/typed.js/), [GSAP SplitText](https://gsap.com/docs/v3/Plugins/SplitText/), and [Motion examples](https://motion.dev/examples). The implementations use native JavaScript and CSS.
- Design research: [Anthony Fu](https://antfu.me/), [Paco Coursey](https://paco.me/), [Lee Robinson](https://leerob.com/), and [Jhey Tompkins](https://www.jhey.dev/). Used for storytelling/structure inspiration; no code or assets copied.

The repository archive contains public repositories only. At the owner’s request, the featured selection also includes a high-level introduction to private project ShelbyFans, clearly labelled “Private source” without a source link. No private code, credentials, employment/location claims, invented outcomes, or contact details from account authentication are published.

## Writing articles

Article text stays in Markdown. The homepage, article index, and reading pages are generated ahead of time, so visitors can read without JavaScript or GitHub API requests. The site language switch changes navigation and controls; each article keeps its original language.

To publish another article:

1. Add `articles/<slug>.md` with a single H1 title followed by the article.
2. Add its metadata to `articles/catalog.json`: `slug`, `source`, `title` (matching the H1), `summary`, `date` (`YYYY-MM-DD`), `language` (`zh-CN` or `en`), `category`, and `categoryEn`.
3. With Node 20 or newer, run `npm ci` once, then `npm run build:articles`.
4. Run `npm run check:articles` and review the generated homepage and `writing/` files. Commit those outputs together with the Markdown and catalog changes.

Only the build uses `marked`; the published reading pages have no Markdown runtime dependency. Raw HTML in Markdown is escaped, unsafe link schemes are excluded, tables can scroll independently, and headings have stable section links. Keep the existing `<!-- writing:start -->` and `<!-- writing:end -->` homepage markers.

The Vibe42 article draws on official documentation, open-source repositories, and analysis of the public installer package. Vendor installers and binaries are not redistributed in this repository.

## Deployment

The `master` branch publishes the checked-in static output through the existing GitHub Pages setup. `.nojekyll` preserves the generated routes and Markdown source files without an additional Jekyll conversion. Keep the `CNAME` file absent so the site stays at `https://huaigu.github.io/`. The repository currently contains generated static output; if an external Hexo deployment regenerates `index.html`, update that source/deployment process before publishing this redesign.
