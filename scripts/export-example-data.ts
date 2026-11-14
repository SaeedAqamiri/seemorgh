import { exportExampleData } from "../src/lib/example-data";

async function main() {
  const counts = await exportExampleData();
  console.log("example data exported to data/example");
  for (const [name, count] of Object.entries(counts)) {
    console.log(`${name}: ${count}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
