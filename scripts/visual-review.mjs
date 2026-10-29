import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Works in the repository or an extracted visual-windows-2022 artifact.
const root = resolve(process.argv[2] ?? ".");
const projects = ["wide-light", "wide-dark", "narrow-light", "narrow-dark"];
const screens = [
  "today",
  "progress",
  "goals",
  "chats",
  "settings-general",
  "settings-ai",
  "settings-privacy",
  "buddy",
];
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const environmentPath = join(root, "test-results/environment.json");
const environment = existsSync(environmentPath)
  ? readFileSync(environmentPath, "utf8")
  : "Local candidates: canonical CI environment has not been recorded.";
let count = 0;
const sections = projects
  .map((project) => {
    const names = [
      ...screens,
      ...(project.startsWith("wide") ? ["collapsed-sidebar"] : []),
    ];
    const images = names
      .map((screen) => {
        const path = join(root, "visual/baselines", project, `${screen}.png`);
        if (!existsSync(path))
          throw new Error(`Missing candidate: ${project}/${screen}.png`);
        count += 1;
        const url = `../visual/baselines/${project}/${screen}.png`;
        return `<figure><a href="${url}" target="_blank"><img src="${url}" alt="${escape(project)}: ${escape(screen)}" loading="lazy"></a><figcaption>${escape(screen)} · ${project.startsWith("wide") ? "1280×873" : "720×873"}</figcaption></figure>`;
      })
      .join("\n");
    return `<section id="${project}"><h2>${project}</h2><div class="grid">${images}</div></section>`;
  })
  .join("\n");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>sumi · visual candidate review</title>
<style>body{font-family:"Instrument Sans",sans-serif;margin:2rem;background:#f6f6f3;color:#1f1f1f}main{max-width:90rem;margin:auto}h1,h2{font-weight:500}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,32rem),1fr));gap:1rem}figure{margin:0;background:white;border:1px solid #ddd;padding:.5rem}img{display:block;width:100%;height:auto}figcaption{padding:.5rem}nav{display:flex;gap:1rem;flex-wrap:wrap}pre{overflow:auto;padding:1rem;background:white}section{margin-top:3rem}a{color:#5143cc}</style>
<main><h1>Review ${count} visual candidates</h1><p>Open each image at full size to review it. These are candidates; this page does not approve or update any baseline.</p><p>Application base: <code>11760017314095d75374449690c2a1c42c5af08a</code>. Confirm every screen, theme, viewport and the collapsed sidebar before approving.</p><nav>${projects.map((project) => `<a href="#${project}">${project}</a>`).join("")}</nav><details><summary>Capture environment and source commit</summary><pre>${escape(environment)}</pre></details>${sections}</main></html>`;
mkdirSync(join(root, "test-results"), { recursive: true });
const output = join(root, "test-results/visual-review.html");
writeFileSync(output, html);
console.log(`Review ${count} candidates: ${output}`);
