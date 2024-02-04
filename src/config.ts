import { readFileSync } from "fs";
import { resolve } from "path";

export const DATA_PATH = resolve(process.env.DATA_PATH || "./.data");
export const MEDIA_URLS_FILE = resolve(DATA_PATH, "media_urls.json");
const PODCAST_LIST_FILE = resolve(DATA_PATH, "podcasts.txt");

export const HOST = process.env.HOST || "localhost";
export const PORT = process.env.PORT || 3000;
export const BASE_URL = process.env.BASE_URL || `http://${HOST}:${PORT}`;
export const WEBMASTER = process.env.WEBMASTER ||
  `webmaster@${new URL(BASE_URL).hostname}`;

export const DISABLE_SANDBOX = process.env.DISABLE_SANDBOX === "true";
export const USER_DATA_DIR = resolve(DATA_PATH, "chromium_user_data");

function throwsMissingEnvVar(name: string): never {
  throw new Error(`Missing ${name} environment variable`);
}

export const AUVIO_CREDENTIALS = {
  email: process.env.AUVIO_EMAIL || throwsMissingEnvVar("AUVIO_EMAIL"),
  password: process.env.AUVIO_PASSWORD || throwsMissingEnvVar("AUVIO_PASSWORD"),
};

// Read the list of podcasts from the file
export const podcastsURLs = readFileSync(PODCAST_LIST_FILE, "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
