// Auth dùng chung cho Sheets + Drive — cơ chế OAuth 2.0 (thay mặt 1 user Google).
//
// Hai nguồn cấu hình (ưu tiên ENV, fallback file):
//   credentials.json  ↔  GOOGLE_OAUTH_CREDENTIALS_JSON   (OAuth client "Desktop", tải từ Google Cloud)
//   token.json        ↔  GOOGLE_OAUTH_TOKEN_JSON         (sinh ra sau khi chạy `node lib/auth.mjs` 1 lần)
//
// Access token tự được googleapis gia hạn bằng refresh token trong token.json.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { google } from "googleapis";

// Mặc định googleapis không có timeout → một lệnh Sheets/Drive treo là treo luôn lệnh MCP của bot.
google.options({ timeout: 30_000 });

export const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

function loadJson(envName, filePath) {
  const raw = (process.env[envName] || "").trim();
  if (raw) {
    try {
      return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      throw new Error(`${envName} không phải JSON hoặc base64(JSON) hợp lệ`);
    }
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function loadCredentials() {
  const creds = loadJson("GOOGLE_OAUTH_CREDENTIALS_JSON", "credentials.json");
  if (!creds) {
    throw new Error(
      "Thiếu OAuth client. Tải 'Desktop app' OAuth client từ Google Cloud Console → " +
      "lưu thành credentials.json (hoặc set GOOGLE_OAUTH_CREDENTIALS_JSON)."
    );
  }
  // credentials.json có dạng { installed: {...} } hoặc { web: {...} }
  const node = creds.installed || creds.web || creds;
  return {
    clientId: node.client_id,
    clientSecret: node.client_secret,
    redirectUris: node.redirect_uris || ["http://localhost"],
  };
}

export function makeOAuthClient(redirectUri) {
  const { clientId, clientSecret, redirectUris } = loadCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri || redirectUris[0]);
}

// NP v2 trên Mac mini: MỘT file dạng authorized_user (client_id + client_secret + refresh_token) ở
// ~/Bots/.secrets/np-google-token.json (hoặc biến NP_GOOGLE_TOKEN) — tạo bằng lib/google-dang-nhap.py. Có file đó thì
// dùng luôn, khỏi cần credentials.json/token.json trong thư mục repo (bot NP đọc được thư mục repo của nó).
function tuFileAuthorizedUser() {
  const p = process.env.NP_GOOGLE_TOKEN || join(homedir(), "Bots", ".secrets", "np-google-token.json");
  if (!existsSync(p)) return null;
  const t = JSON.parse(readFileSync(p, "utf8"));
  if (t.type !== "authorized_user" || !t.refresh_token) throw new Error(`${p} không phải token authorized_user hợp lệ`);
  const c = new google.auth.OAuth2(t.client_id, t.client_secret);
  c.setCredentials({ refresh_token: t.refresh_token });
  return c;
}

// Client đã nạp refresh token — dùng cho mọi thao tác đọc/ghi thật.
export function getAuthClient() {
  const au = tuFileAuthorizedUser();
  if (au) return au;
  const token = loadJson("GOOGLE_OAUTH_TOKEN_JSON", "token.json");
  if (!token) {
    throw new Error(
      "Chưa đăng nhập Google. Chạy 1 lần: `node lib/auth.mjs` để tạo token.json " +
      "(hoặc set GOOGLE_OAUTH_TOKEN_JSON cho routine cloud)."
    );
  }
  const client = makeOAuthClient();
  client.setCredentials(token);
  return client;
}
