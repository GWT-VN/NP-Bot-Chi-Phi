#!/usr/bin/env node
// Đăng nhập Google MỘT LẦN để lấy refresh token (lưu vào token.json).
// Dùng: node lib/auth.mjs
// Cần có credentials.json (OAuth client "Desktop") trong thư mục, hoặc env GOOGLE_OAUTH_CREDENTIALS_JSON.
// Sau khi xong: copy nội dung token.json vào secret GOOGLE_OAUTH_TOKEN_JSON của routine.

import http from "node:http";
import { writeFileSync } from "node:fs";
import { exec } from "node:child_process";
import { makeOAuthClient, SCOPES } from "./google-auth.mjs";

function openBrowser(url) {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` :
    process.platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => {});
}

const server = http.createServer((req, res) => {
  const oauth = server._oauth;
  const redirectUri = server._redirectUri;
  const url = new URL(req.url, redirectUri);
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Đang chờ mã đăng nhập...");
    return;
  }
  oauth.getToken(code).then(({ tokens }) => {
    writeFileSync("token.json", JSON.stringify(tokens, null, 2), "utf8");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Đăng nhập thành công! Đã lưu token.json. Bạn có thể đóng tab này.");
    console.log("\n✅ Đã lưu token.json.");
    console.log("   Refresh token:", tokens.refresh_token ? "CÓ ✓" : "KHÔNG ✗ (xóa token.json rồi chạy lại)");
    console.log("   → Copy nội dung token.json vào secret GOOGLE_OAUTH_TOKEN_JSON khi lên lịch routine.");
    setTimeout(() => process.exit(0), 400);
  }).catch((e) => {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Lỗi: " + e.message);
    console.error("Lỗi đổi token:", e.message);
    process.exit(1);
  });
});

server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const redirectUri = `http://localhost:${port}`;
  const oauth = makeOAuthClient(redirectUri);
  server._oauth = oauth;
  server._redirectUri = redirectUri;

  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n=== Đăng nhập Google cho tool chi phí ===");
  console.log("Trình duyệt sẽ tự mở. Nếu KHÔNG mở, copy link dưới đây dán vào trình duyệt:\n");
  console.log(authUrl + "\n");
  openBrowser(authUrl);
});
