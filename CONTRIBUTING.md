# Getting set up to work on Glide Data Grid

### Setting Up Codespaces

If you'd like to set up glide data grid locally and contribute, the easiest way to get up and running
is to use Codespaces if you have access to it. If you do not, simply cloning the repo and running `npm install` also works!

#### Steps

-   Click the green dropdown labeled code, there should be two tabs: local and codespaces.
-   Click on codespaces.
-   If this is your first time, then create a new codespace. It will open a new browser tab and build the docker container for it - there will be a button to open the environment in VSCode if you'd prefer to run it that way
-   You should see a screen that says `Setting up your codespace` As soon as that's done, you should see a VSCode like UI with files on the left.

Once codespaces is up and running make sure `jq` is installed and then:

```bash
npm run install && npm run storybook
```

## Forking the data grid?

Please consider submitting your work for review. We are a small project, but we are super enthused when anyone comes by to help us build the best damned data grid on the internet.

## Contributing new cells

If you wish to contribute new cells, please add them to the `cells` package. There are already other cells in that package which can be used as an example. If your cell editor requires additional third party dependencies please consider using a React.lazy to allow for code splitting.

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same MIT License that covers the project. Feel free to contact the maintainers if that's a concern.

## Working on the docs site

The documentation site (https://ai-data-grid-docs.vercel.app) lives in `docs/`. It is a standalone [unmint](https://github.com/gregce/unmint) app (Next.js 16 + Fumadocs + React 19) with its own `package.json` and `package-lock.json`. It is **not** one of the root npm `workspaces`, so the root `npm ci`, `npm run build` and `npm test` neither install nor check it. Run everything from `docs/`. Use Node 24 (the Vercel project builds with Node 24.x).

```bash
cd docs && npm ci && npm run dev -- -H 0.0.0.0   # dev server on port 3000; / redirects to /docs
npm run build                                     # production build (static pages for every doc)
npm test -- --run                                 # vitest unit tests, run once (plain `npm test` watches)
```

Add `-p <port>` to the dev command to use another port. In the dev sandbox, run it detached in tmux and share it with `sb-url <port>`.

`next dev` writes untracked `docs/AGENTS.md` and `docs/CLAUDE.md` files (Next.js agent rules). Delete them and don't commit them. `npm run lint` in `docs/` doesn't work yet (Next.js 16 removed `next lint`), so there is no lint step for the docs site.

### Content

- Pages are MDX in `docs/content/docs/`. `meta.json` files set the sidebar order.
- `docs/content/docs/index.mdx` (the welcome page, served at `/docs`) and `docs/content/docs/about.mdx` (About & License) are hand-maintained.
- Every other page is generated from the Glide Data Grid GitBook docs by the importer, then hand-edited to replace the product name. Images are in `docs/public/images/`.
- Keep the attribution "Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed." on the welcome page, on the About & License page and in the site footer (`docs/lib/theme-config.ts`).

### Re-running the GitBook importer

```bash
cd docs && node scripts/import-gitbook.mjs
```

This fetches the 36 pages listed in https://docs.grid.glideapps.com/llms.txt, downloads the 17 images again and rewrites every `meta.json`. It skips `index.mdx` and `about.mdx`, but it **overwrites every other page**. That undoes the hand edits that replaced "Glide Data Grid" with "AI Data Grid" (in five pages at the time of writing). After a re-import, review `git diff docs/content` and re-apply those edits before committing.

### Deploys (Vercel)

- The Vercel project `ai-data-grid-docs` (team `spec-story`) is connected to this repo with Root Directory `docs`. Vercel builds on every push. Production deploys come from `main`, and every other branch gets a preview deployment, linked from the PR's `Vercel` status.
- `ignoreCommand` in `docs/vercel.json` skips the build when nothing under `docs/` changed since the previous deployment. It builds when there is no previous deployment or when the `git diff` fails.
- Preview deployments are protected by Vercel Authentication (sign in with a `spec-story` team account). The production URL is public.
- A push to a branch that has no `docs/` directory produces a failed (ERROR) `Vercel` status, because the Root Directory is missing. That is expected until the branch merges a `main` that contains `docs/`. See [AS-BUILT.md](AS-BUILT.md#docs-site).
