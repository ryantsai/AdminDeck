#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(rootDir, "src", "i18n", "locales");
const sourceLocale = "en.json";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flattenLeafKeys(value, prefix = "") {
  if (!isRecord(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return isRecord(child) ? flattenLeafKeys(child, nextPrefix) : [nextPrefix];
  });
}

async function readJson(fileName) {
  const filePath = path.join(localesDir, fileName);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${fileName}: ${error.message}`);
  }
}

function diffKeys(sourceKeys, localeKeys) {
  const source = new Set(sourceKeys);
  const locale = new Set(localeKeys);

  return {
    missing: sourceKeys.filter((key) => !locale.has(key)),
    redundant: localeKeys.filter((key) => !source.has(key)),
  };
}

function printKeyList(label, keys) {
  if (keys.length === 0) {
    return;
  }

  console.log(`  ${label} (${keys.length}):`);
  for (const key of keys) {
    console.log(`    - ${key}`);
  }
}

const localeFiles = (await readdir(localesDir))
  .filter((name) => name.endsWith(".json"))
  .sort((a, b) => a.localeCompare(b, "en"));

if (!localeFiles.includes(sourceLocale)) {
  throw new Error(`Missing source locale ${sourceLocale}`);
}

const sourceKeys = flattenLeafKeys(await readJson(sourceLocale)).sort();
let problemCount = 0;

for (const fileName of localeFiles) {
  if (fileName === sourceLocale) {
    continue;
  }

  const localeKeys = flattenLeafKeys(await readJson(fileName)).sort();
  const { missing, redundant } = diffKeys(sourceKeys, localeKeys);

  if (missing.length === 0 && redundant.length === 0) {
    console.log(`${fileName}: OK (${localeKeys.length} keys)`);
    continue;
  }

  problemCount += missing.length + redundant.length;
  console.log(`${fileName}: ${missing.length} missing, ${redundant.length} redundant`);
  printKeyList("Missing from locale", missing);
  printKeyList("Redundant in locale", redundant);
}

if (problemCount > 0) {
  console.error(`Locale key check failed: ${problemCount} mismatch(es).`);
  process.exitCode = 1;
} else {
  console.log(`All locale files match ${sourceLocale} (${sourceKeys.length} keys).`);
}
