"""Vibe Pet plugin for Hermes Agent."""

from __future__ import annotations

import json
from pathlib import Path
from urllib import request
from urllib.error import URLError

AGENT_ID = "hermes"
RUNTIME_PATH = Path.home() / ".code-pet" / "runtime.json"
PORTS = (17384, 17385, 17386, 17387, 17388)

HOOK_TO_STATE = {
    "on_session_start": ("idle", "SessionStart"),
    "pre_llm_call": ("thinking", "UserPromptSubmit"),
    "post_llm_call": ("attention", "Stop"),
    "pre_tool_call": ("working", "PreToolUse"),
    "post_tool_call": ("working", "PostToolUse"),
    "on_session_end": ("attention", "Stop"),
    "on_session_finalize": ("sleeping", "SessionEnd"),
    "on_session_reset": ("idle", "SessionStart"),
}

_cached_port = None


def _runtime_port():
    try:
        data = json.loads(RUNTIME_PATH.read_text(encoding="utf-8"))
        port = int(data.get("port"))
        return port if 0 < port < 65536 else None
    except Exception:
        return None


def _ports():
    seen = set()
    for port in (_cached_port, _runtime_port(), *PORTS):
        if port and port not in seen:
            seen.add(port)
            yield port


def _session_id(kwargs):
    raw = (
        kwargs.get("session_id")
        or kwargs.get("sessionId")
        or kwargs.get("conversation_id")
        or "default"
    )
    text = str(raw)
    return text if text.startswith(f"{AGENT_ID}:") else f"{AGENT_ID}:{text}"


def _post_state(body):
    global _cached_port
    payload = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json", "Content-Length": str(len(payload))}
    for port in _ports():
        req = request.Request(
            f"http://127.0.0.1:{port}/api/hook",
            data=payload,
            headers=headers,
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=0.25) as response:
                if response.status < 400:
                    _cached_port = port
                    return
        except (OSError, URLError):
            continue
        except Exception:
            continue


def _handle_hook(name, **kwargs):
    state, event = HOOK_TO_STATE[name]
    cwd = kwargs.get("cwd") or kwargs.get("directory") or ""
    _post_state({
        "agentId": AGENT_ID,
        "agentName": "Hermes Agent",
        "sessionId": _session_id(kwargs),
        "cwd": cwd,
        "state": state,
        "event": event,
    })


def _make_callback(name):
    def callback(**kwargs):
        try:
            _handle_hook(name, **kwargs)
        except Exception:
            pass
        return None

    return callback


def register(ctx) -> None:
    for hook_name in HOOK_TO_STATE:
        ctx.register_hook(hook_name, _make_callback(hook_name))
