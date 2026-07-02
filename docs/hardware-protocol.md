# Hardware Protocol

This document describes how Vibe Pet sends desktop pet state to hardware devices.

Hardware integrations should treat the protocol as display-only. Devices receive small JSON packets that describe state, agent label, title, selected character identity, and timestamp. Devices should ignore unknown fields so protocol version `1` can evolve safely.

## BLE GATT

| Item | Value |
| --- | --- |
| Service UUID | `7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001` |
| State characteristic UUID | `7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002` |
| Characteristic direction | Desktop writes, device receives |
| Payload encoding | UTF-8 JSON |
| Device name prefixes | `VibePet-Wio`, `VibePet-ESP-AI`, `VibePet-ESP-Display`, `VibePet-SenseCAP`, `VibePet-M5`, `VibePet-LILYGO`, `VibePet-Heltec`, `VibePet-WEMOS` |
| Legacy prefixes | `CodePet-Wio`, `CodePet-ESP-AI`, `CodePet-ESP-Display`, `CodePet-SenseCAP`, `CodePet-M5`, `CodePet-LILYGO`, `CodePet-Heltec`, `CodePet-WEMOS` |

BLE devices advertise the service UUID and use one writable characteristic. The desktop app writes a single compact JSON packet whenever the active pet state changes or needs to be resent.

## Compact Device Packet

```json
{
  "v": 1,
  "s": "working",
  "a": "Codex",
  "e": "response_item:function_call",
  "n": 1,
  "m": "vibe-pet",
  "p": "lulu-capybara-2",
  "d": "噜噜",
  "k": "builtin",
  "u": "assets/lulu-capybara.webp",
  "ts": 1781500000000
}
```

| Key | Type | Description |
| --- | --- | --- |
| `v` | number | Protocol version. Currently `1`. |
| `s` | string | Pet state. See [States](#states). |
| `a` | string | Agent label, such as `Codex`, `Cursor`, or `Windsurf`. |
| `e` | string | Source event name. |
| `n` | number | Active session count after aggregation. |
| `m` | string | Short session title or workspace basename. |
| `p` | string | Selected character/persona slug. |
| `d` | string | Selected character/persona display name. |
| `k` | string | Character/persona kind, such as `builtin` or `petdex`. |
| `u` | string | Optional spritesheet URL or asset path. |
| `ts` | number | Desktop timestamp in milliseconds. |

The color display firmware also accepts long-form aliases such as `state`, `agentName`, `agent`, `event`, `title`, `activeCount`, and nested `persona` fields. Low-resource devices can ignore character fields and render a local simplified character.

## States

| State | Suggested device behavior |
| --- | --- |
| `idle` | Calm idle animation. |
| `thinking` | Thinking or eye movement animation. |
| `working` | Active tool-use or editing animation. |
| `typing` | Text output animation. |
| `building` | Stronger work/build animation. |
| `juggling` | Multi-task animation. |
| `attention` | Soft notification or completed-turn pose. |
| `notification` | Approval or important action indicator. |
| `error` | Error color, shake, or alert pose. |
| `sweeping` | Context cleanup or sweep animation. |
| `sleeping` | Sleep or dimmed state. |

`permission` and `codex-permission` are normalized to `notification` by the bridge before hardware rendering.

## Wi-Fi Device Snapshot

ESP8266 boards do not provide BLE, so they use local Wi-Fi polling:

```text
GET /api/device-snapshot
```

The response contains the hardware-facing pet list and an aggregate fallback:

```json
{
  "v": 1,
  "at": 1781500000000,
  "pets": [
    {
      "id": "editor:cursor:/project",
      "title": "vibe-pet",
      "state": "working",
      "stateLabel": "Working",
      "agentId": "cursor",
      "agentName": "Cursor",
      "persona": {
        "slug": "lulu-capybara-2",
        "displayName": "噜噜",
        "kind": "builtin",
        "spritesheetUrl": "assets/lulu-capybara.webp"
      },
      "packet": {
        "v": 1,
        "s": "working",
        "a": "Cursor",
        "m": "vibe-pet",
        "p": "lulu-capybara-2",
        "d": "噜噜",
        "k": "builtin",
        "u": "assets/lulu-capybara.webp",
        "ts": 1781500000000
      }
    }
  ],
  "aggregate": {
    "v": 1,
    "s": "working",
    "a": "Cursor",
    "m": "vibe-pet",
    "ts": 1781500000000
  }
}
```

Display firmware should select the first pet whose state is not `idle` or `sleeping`. If all pets are idle, select the first pet. If `pets` is empty, render `aggregate`.

## Character Sync

The desktop UI lets each pet choose a character. Hardware receives the selected identity through:

| Field | Meaning |
| --- | --- |
| `p` | Character slug, stable id for display caching. |
| `d` | Display name, such as `噜噜`. |
| `k` | Character source/type, such as `builtin` or `petdex`. |
| `u` | Spritesheet URL or local asset path. |

Color displays can use these fields to choose a palette, local sprite, or downloaded sprite. OLED devices can render the same name and state with a local simplified body.

## Recommended Device Implementation

1. Advertise a `VibePet-*` device name and the service UUID.
2. Expose the state characteristic as writable.
3. Parse incoming UTF-8 JSON.
4. Read `s`, `a`, `e`, `m`, `p`, `d`, `k`, `u`, and `n`.
5. Ignore unknown fields.
6. Fall back to `idle`, `agent`, and a local default character when fields are missing.
7. Keep rendering the last valid packet if a malformed packet arrives.

Pseudo-code:

```cpp
void applyPacket(JsonVariantConst src) {
  String state = src["s"] | src["state"] | "idle";
  String agent = src["a"] | src["agentName"] | src["agent"] | "agent";
  String title = src["m"] | src["title"] | "";
  String persona = src["d"] | src["persona"]["displayName"] | "Lulu";
  renderPet(state, agent, title, persona);
}
```

## Safety Boundary

Hardware is receive-only in the current protocol. Devices do not send prompts, approval decisions, tool input, or transcript content back to the bridge.
