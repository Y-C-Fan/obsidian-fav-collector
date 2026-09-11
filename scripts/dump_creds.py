"""Dump fresh cookie jar + zhihu secret for local verify driver. Local only, delete after use."""
import json
import sys
sys.path.insert(0, "D:/00-Projects/source-info-mine")
from favmine import credentials

jar = credentials.cookie_jar()


def to_header(domain: str) -> str:
    return "; ".join(f"{k}={v}" for k, v in (jar.get(domain) or {}).items())


out = {
    "bili": to_header("bilibili.com"),
    "x": to_header("x.com"),
    "zhihu": credentials.zhihu_secret(),
}
open("D:/AgentWS/OpenCodeWS/fav-local/.verify-creds.json", "w").write(json.dumps(out))
print("bili cookies:", len(jar.get("bilibili.com") or {}), "| x cookies:", len(jar.get("x.com") or {}))
