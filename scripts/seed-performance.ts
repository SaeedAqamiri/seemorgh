import { seedPerformanceData } from "../src/lib/seed-performance-data";

async function main() {
  const result = await seedPerformanceData();
  console.log(
    `performance demo ready: ${result.panels} weekly panels, ${result.logs} daily logs`,
  );
  process.exit(0);
}

main();
