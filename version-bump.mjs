import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.argv[2];

if (!targetVersion) {
    console.error("Please provide a version number");
    process.exit(1);
}

// read minAppVersion from manifest.json
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const minAppVersion = manifest.minAppVersion;

// read versions.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));

// update versions.json
versions[targetVersion] = minAppVersion;

// write versions.json
writeFileSync("versions.json", JSON.stringify(versions, null, 4));
