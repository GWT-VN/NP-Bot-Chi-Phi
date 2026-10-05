// Test google-auth đọc token dạng authorized_user một file (np-google-token.json) — chạy: node test-auth.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAuthClient } from "./lib/google-auth.mjs";

test("NP_GOOGLE_TOKEN trỏ file authorized_user → client có refresh_token + client_id, không cần credentials.json", () => {
  const p = join(mkdtempSync(join(tmpdir(), "ga-")), "tk.json")
  writeFileSync(p, JSON.stringify({ type: "authorized_user", client_id: "CID", client_secret: "CS", refresh_token: "RT", token_uri: "https://oauth2.googleapis.com/token" }))
  process.env.NP_GOOGLE_TOKEN = p
  const c = getAuthClient()
  assert.equal(c.credentials.refresh_token, "RT"); assert.equal(c._clientId, "CID")
})
