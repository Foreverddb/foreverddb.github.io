import child_process from "child_process";

try {
    child_process.execSync(`npm run docs:build`);
} catch (e) {}
