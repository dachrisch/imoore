#!/usr/bin/env python3
"""Attach Frida to a PID, load a script, and print the first CAPTCHA token.

Usage: fetch-captcha.py <pid> <script.js>
Output: CAPTCHA_TOKEN=<token>  (or CAPTCHA_TIMEOUT / CAPTCHA_ERROR=...)
"""
import sys
import time
import os

import frida
import frida_tools


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: fetch-captcha.py <pid> <script.js>", file=sys.stderr)
        return 2
    pid = int(sys.argv[1])
    with open(sys.argv[2], "r", encoding="utf-8") as f:
        source = f.read()

    # The Python API does not inject the Java bridge automatically (the CLI
    # does). Prepend the bridge shipped with frida-tools so `Java` exists.
    bridge_path = os.path.join(os.path.dirname(frida_tools.__file__), "bridges", "java.js")
    with open(bridge_path, "r", encoding="utf-8") as f:
        bridge = f.read()
    source = (
        "(function () {\n"
        + bridge
        + "\nObject.defineProperty(globalThis, 'Java', { value: bridge });\nreturn bridge;\n})();\n"
        + source
    )

    device = frida.get_usb_device(timeout=5)
    session = device.attach(pid)
    script = session.create_script(source, runtime="v8")
    token = None
    error = None

    def on_message(message, data):
        nonlocal token, error
        if message.get("type") == "send":
            payload = message.get("payload") or {}
            if payload.get("type") == "token":
                token = payload.get("token")
                print("CAPTCHA_TOKEN=" + str(token), flush=True)
            elif payload.get("type") == "error":
                error = payload.get("error")
                print("CAPTCHA_ERROR=" + str(error), flush=True)
        elif message.get("type") == "error":
            error = message.get("description")
            print("CAPTCHA_ERROR=" + str(error), flush=True)

    script.on("message", on_message)
    script.load()

    deadline = time.time() + 30
    while time.time() < deadline and token is None and error is None:
        time.sleep(0.2)

    if token is None:
        print("CAPTCHA_TIMEOUT", flush=True)
        return 3
    if error is not None and token is None:
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
