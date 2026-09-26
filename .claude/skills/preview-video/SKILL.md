---
name: preview-video
description: Regenerate the animated scroll preview video for this project (media/preview.webm, preview.mp4, preview-poster.png). Use when asked to update, refresh, or re-record the project preview/demo video, or after significant UI or landing page changes.
---

# Preview Video — animated scroll capture

Generates a smooth-scroll recording of the deployed project (Refero-style) and saves it to `media/`.

## Prerequisites

- `ffmpeg` available on PATH (`ffmpeg -version`). The Claude cloud container has none on
  PATH, so run the capture on a machine that does.
- Playwright Chromium. Locally: `npx playwright install chromium` once per machine. In the
  Claude cloud environment the browser is preinstalled under `/opt/pw-browsers` and
  `playwright install` is disabled: skip it and set
  `CAPTURE_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- The `playwright` package must resolve from the script's folder. This monorepo installs it
  only inside the pnpm store (for `site/`'s `@playwright/test`), so link it once from the
  repository root; `node_modules/` is git-ignored:
  `mkdir -p .claude/skills/preview-video/node_modules && ln -sfn "$PWD/node_modules/.pnpm/node_modules/playwright" .claude/skills/preview-video/node_modules/playwright`

## Steps

1. Open `preview.config.json` in this skill folder and verify `url` is still correct.
   The committed config points at `http://localhost:3000/` with no `devServer`, so start
   `pnpm dev` first or set `"devServer": { "command": "pnpm dev", "port": 3000 }`.
2. From the repo root run:
   `npx -y tsx .claude/skills/preview-video/scripts/capture-preview.ts`
3. QA: open `media/preview-poster.png` and 2–3 frames from the temp dir printed by the
   script. Verify: no cookie banners or chat widgets (add offending selectors to
   `hideSelectors` and re-run), fonts and images fully loaded, scroll reaches the footer.
4. Check sizes: `preview.webm` ≤ ~4 MB, `preview.mp4` ≤ ~6 MB. If larger, raise the
   webm CRF (34 → 38) in the script call or set `deviceScaleFactor` to 1.
5. Commit the regenerated files in `media/`.

## Troubleshooting

- Smooth-scroll libraries (Lenis, Locomotive, GSAP ScrollTrigger) hijacking the scroll:
  the injected `scroll-behavior: auto` usually fixes it; otherwise disable the library
  for capture via `extraCss` or an env flag in the app.
- Fixed-shell SPA where the window itself does not scroll (an inner `<main>` or a
  panel scrolls instead, so the capture comes out static): set `scrollSelector` in the
  config to that container's CSS selector (e.g. `"main"`). Leave it out for normal pages.
- Blank sections in frames: increase `waitAfterLoadMs`, or slow down the lazy-load
  pre-scroll (raise its per-step timeout in the script).
- `networkidle` never settles (analytics polling): harmless — the script falls back
  after 10 s.
- Need a GIF (e.g. for a README): set `"gif": true` and re-run.

## Environment overrides (advanced)

The script reads a few optional environment variables. All are no-ops when unset, so a
normal local run behaves exactly as described above. They exist so the same script can
run behind a restricted network (e.g. a CI sandbox whose browser egress must go through a
proxy):

- `CAPTURE_PROXY_SERVER` — route the browser through an HTTP proxy, e.g.
  `http://127.0.0.1:8899`. Use a local TLS-terminating bridge (mitmproxy in
  `upstream` mode) when the environment only exposes a policy-enforcing egress proxy.
- `CAPTURE_INSECURE=1` — ignore TLS certificate errors. Only meaningful together with a
  re-signing MITM proxy; never needed for a direct connection.
- `CAPTURE_EXTRA_ARGS` — extra comma-separated Chromium flags.
- `CAPTURE_EXECUTABLE_PATH` — launch this Chromium binary instead of Playwright's download.

`--no-sandbox` is added automatically when the script runs as root (required by Chromium),
and `--disable-quic` is always set to keep HTTP-proxy captures reliable.

## Hand-off to the portfolio

This recording is also the animated thumbnail for this project on
lukaskouril.dev. After regenerating it, copy all three files into the portfolio
repository:

```
media/preview.webm        →  nxt-portfolio/public/previews/quorum/preview.webm
media/preview.mp4         →  nxt-portfolio/public/previews/quorum/preview.mp4
media/preview-poster.png  →  nxt-portfolio/public/previews/quorum/preview-poster.png
```

The directory name is the portfolio work item's `id`, which is not always the
repository name. Keep the three files together: the portfolio sets
`preload="none"`, so the poster is the only thing shown until playback starts,
and a stale poster is what reduced-motion visitors and search engines see.

Budget for the portfolio homepage: webm under ~1 MB, mp4 under ~1.5 MB, poster
under ~600 KB. Raise the webm CRF from 34 toward 38 if the clip runs over.

Record only surfaces a logged-out visitor can reach, so no private data is
filmed. See `nxt-portfolio/.claude/skills/preview-video/SKILL.md` for the full
ingestion procedure.
