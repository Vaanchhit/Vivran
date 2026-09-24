import { verifyLibrary } from "../verify";
import { LAYOUTS } from "../layouts";
const issues = verifyLibrary();
for (const i of issues) console.log(`✗ ${[i.layout ?? i.type, i.grade].filter(Boolean).join(" @ ")}: ${i.msg}`);
console.log(`\n${LAYOUTS.length} layouts, ${issues.length} issue(s)`);
process.exit(issues.length ? 1 : 0);
