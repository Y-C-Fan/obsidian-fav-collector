"""小宇宙短信登录（一次性）：拿 access_token + refresh_token 粘进插件设置页。
借用 r266-tech/xiaoyuzhou 的端点（podcaster-api），只读用途，低频调用。

用法（source-info-mine 的 venv 里有 requests）：
    PY scripts/xyz_login.py send-code 138xxxxxxxx
    # 手机收验证码后：
    PY scripts/xyz_login.py login 138xxxxxxxx 123456
"""
import json
import sys

import requests

BASE = "https://podcaster-api.xiaoyuzhoufm.com"
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "origin": "https://podcaster.xiaoyuzhoufm.com",
    "referer": "https://podcaster.xiaoyuzhoufm.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}


def send_code(phone: str) -> None:
    r = requests.post(f"{BASE}/v1/auth/send-code",
                      json={"mobilePhoneNumber": phone, "areaCode": "+86"},
                      headers=HEADERS, timeout=20)
    print(r.status_code, r.text[:200])
    r.raise_for_status()
    print("验证码已发送")


def login(phone: str, code: str) -> None:
    r = requests.post(f"{BASE}/v1/auth/login-with-sms",
                      json={"areaCode": "+86", "verifyCode": code, "mobilePhoneNumber": phone},
                      headers=HEADERS, timeout=20)
    print("status:", r.status_code)
    r.raise_for_status()
    access = r.headers.get("x-jike-access-token", "")
    refresh = r.headers.get("x-jike-refresh-token", "")
    user = r.json().get("data", {}).get("user", {})
    print(json.dumps({"uid": user.get("uid"), "nickname": user.get("nickname"),
                      "access_token": access, "refresh_token": refresh},
                     ensure_ascii=False, indent=1))
    if access:
        print("\n把 access_token（+ refresh_token）粘进 Obsidian 设置 → Fav Collector")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
    elif sys.argv[1] == "send-code":
        send_code(sys.argv[2])
    elif sys.argv[1] == "login" and len(sys.argv) >= 4:
        login(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
