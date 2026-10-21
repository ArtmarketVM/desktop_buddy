import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function compact(snapshot) {
  return {
    status: snapshot.status,
    conclusion: snapshot.conclusion,
    jobs: (snapshot.jobs ?? []).map((job) => ({
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      step: job.steps?.find((s) => s.status === "in_progress")?.name ?? "",
    })),
  };
}
export async function watch({
  read,
  wait,
  emit,
  interval = 60000,
  maxErrors = 3,
}) {
  let previous,
    errors = 0;
  while (true) {
    let snapshot;
    try {
      snapshot = compact(await read());
      errors = 0;
    } catch (error) {
      errors++;
      if (errors >= maxErrors)
        throw new Error("Monitoring unavailable; CI outcome is unknown", {
          cause: error,
        });
      await wait(interval * errors);
      continue;
    }
    const signature = JSON.stringify(snapshot);
    if (signature !== previous) {
      emit(snapshot);
      previous = signature;
    }
    if (snapshot.status === "completed")
      return snapshot.conclusion === "success" ? 0 : 1;
    await wait(interval);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [run] = process.argv.slice(2);
  if (!/^\d+$/.test(run ?? ""))
    throw new Error("Usage: npm run ci:watch -- RUN_ID");
  process.exitCode = await watch({
    read: () =>
      JSON.parse(
        execFileSync(
          "gh",
          ["run", "view", run, "--json", "status,conclusion,jobs"],
          { encoding: "utf8", timeout: 30000 },
        ),
      ),
    wait: (ms) => new Promise((done) => setTimeout(done, ms)),
    emit: (value) => console.log(JSON.stringify(value)),
  });
}
