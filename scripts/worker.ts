import { tick } from "../lib/service";
async function run() {
  try {
    await tick();
  } catch (e) {
    console.error("Season worker:", e instanceof Error ? e.message : "error");
  }
}
await run();
setInterval(() => void run(), 30000);
