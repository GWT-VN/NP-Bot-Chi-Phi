"""Đăng nhập Google ai@gwt.vn cho bot NP — token GHI Sheet + Drive (sổ chi phí + ảnh chứng từ). Chỉ dùng thư viện chuẩn.

Chạy (Terminal ở đâu cũng được, trình duyệt ở đâu cũng được):
    /usr/bin/python3 lib/google-dang-nhap.py
Cần trước: file OAuth client "Desktop app" (tải từ Google Cloud Console) ở ~/Bots/.secrets/google-client.json.
Ra: ~/Bots/.secrets/np-google-token.json (chmod 600, dạng authorized_user — lib/google-auth.mjs đọc thẳng).

Vì sao token RIÊNG (không dùng token chỉ-đọc của Bắp): NP phải GHI sổ + tải ảnh lên Drive; Bắp chỉ đọc khuyến mại —
tách token để mỗi bot chỉ có đúng quyền nó cần.
Luồng "dán lại URL": Google chuyển về http://localhost:8765/?code=... — trang báo không kết nối được là BÌNH THƯỜNG,
chỉ cần copy địa chỉ đó dán vào Terminal. Nhờ vậy chạy được cả qua SSH lẫn trên màn hình Mac mini.
"""
import json
import os
import secrets
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BI_MAT = Path.home() / "Bots" / ".secrets"
CLIENT_FILE = BI_MAT / "google-client.json"
TOKEN_FILE = BI_MAT / "np-google-token.json"
REDIRECT = "http://localhost:8765"
SCOPE = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive"
TAI_KHOAN = "ai@gwt.vn"


def doc_client(d):
    c = d.get("installed") or d.get("web")
    if not c or not c.get("client_id") or not c.get("client_secret"):
        raise ValueError("file OAuth client không đúng dạng (cần mục installed/web có client_id, client_secret)")
    return {"client_id": c["client_id"], "client_secret": c["client_secret"],
            "token_uri": c.get("token_uri") or "https://oauth2.googleapis.com/token"}


def link_dang_nhap(client, redirect, state):
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": client["client_id"], "redirect_uri": redirect, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "state": state, "login_hint": TAI_KHOAN})


def tach_code(url, state):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url.strip()).query)
    if q.get("error"):
        raise ValueError(f"Google báo: {q['error'][0]} (chưa bấm Cho phép?)")
    if q.get("state", [""])[0] != state:
        raise ValueError("state không khớp — dán đúng URL của LẦN chạy này")
    if not q.get("code"):
        raise ValueError("URL không có code — copy NGUYÊN địa chỉ trên thanh trình duyệt")
    return q["code"][0]


def ra_token(client, resp):
    if not resp.get("refresh_token"):
        raise ValueError("Google không trả refresh_token — chạy lại (link đã ép prompt=consent)")
    return {"type": "authorized_user", "client_id": client["client_id"], "client_secret": client["client_secret"],
            "refresh_token": resp["refresh_token"], "token_uri": client["token_uri"], "scopes": SCOPE.split(),
            "account": TAI_KHOAN}


def doi_code(client, code):
    data = urllib.parse.urlencode({"code": code, "client_id": client["client_id"], "client_secret": client["client_secret"],
                                   "redirect_uri": REDIRECT, "grant_type": "authorization_code"}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(client["token_uri"], data=data), timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        loi = json.loads(e.read() or b"{}")
        raise ValueError(f"đổi code lỗi: {loi.get('error')} {loi.get('error_description', '')}".strip())


def main():
    if not CLIENT_FILE.exists():
        sys.exit(f"Thiếu {CLIENT_FILE} — tải OAuth client 'Desktop app' từ Google Cloud Console rồi đặt vào đó.")
    client = doc_client(json.loads(CLIENT_FILE.read_text()))
    state = secrets.token_urlsafe(16)
    print(f"1) Mở link dưới, đăng nhập {TAI_KHOAN}, bấm Cho phép (Allow):\n\n{link_dang_nhap(client, REDIRECT, state)}\n")
    print("2) Trình duyệt chuyển tới localhost và báo KHÔNG KẾT NỐI ĐƯỢC — bình thường.")
    code = tach_code(input("   Copy NGUYÊN địa chỉ trên thanh trình duyệt, dán vào đây rồi Enter:\n"), state)
    tk = ra_token(client, doi_code(client, code))
    BI_MAT.mkdir(parents=True, exist_ok=True)
    tam = TOKEN_FILE.with_suffix(".tam")
    tam.write_text(json.dumps(tk, indent=2))
    os.chmod(tam, 0o600)
    tam.replace(TOKEN_FILE)
    print(f"\n✅ Đã lưu {TOKEN_FILE} (Sheet + Drive). Tiếp: node setup.mjs")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyboardInterrupt) as e:
        sys.exit(f"\n❌ {e}")
