import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const host = process.env.HOST ?? "0.0.0.0";
const port = process.env.PORT ?? "3000";
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

console.log(`Seemorgh starting on http://${host}:${port}`);

const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
