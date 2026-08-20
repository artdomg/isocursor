#!/usr/bin/env python3
"""Cliente del add-on MCP oficial de Blender Lab (TCP localhost:9876).

Protocolo: JSON + null byte, type=execute, igual que execute_blender_code.
https://www.blender.org/lab/mcp-server/
"""
import json
import socket
import sys

HOST, PORT = "127.0.0.1", 9876
TIMEOUT = 180.0


def run(code: str, strict_json: bool = False) -> dict:
    req = {"type": "execute", "code": code, "strict_json": strict_json}
    payload = (json.dumps(req) + "\0").encode("utf-8")
    with socket.create_connection((HOST, PORT), timeout=TIMEOUT) as sock:
        sock.settimeout(TIMEOUT)
        sock.sendall(payload)
        buf = bytearray()
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            buf.extend(chunk)
            if b"\0" in buf:
                break
    data = bytes(buf).split(b"\0", 1)[0]
    return json.loads(data.decode("utf-8"))


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: blender_exec.py <file.py|- >", file=sys.stderr)
        sys.exit(2)
    src = sys.argv[1]
    code = sys.stdin.read() if src == "-" else open(src, encoding="utf-8").read()
    resp = run(code)
    print(json.dumps(resp, indent=2, ensure_ascii=False)[:8000])
    sys.exit(0 if resp.get("status") == "ok" else 1)


if __name__ == "__main__":
    main()
