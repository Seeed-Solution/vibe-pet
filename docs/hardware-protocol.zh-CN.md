# 硬件协议

这份文档说明 Vibe Pet 如何把桌宠状态发送到硬件设备。

硬件集成应该把这套协议当作纯显示协议。设备只会收到小型 JSON 包，里面包含状态、Agent 名称、标题、选中的角色身份和时间戳。设备应忽略未知字段，这样协议版本 `1` 后续可以安全扩展。

## BLE GATT

| 项目 | 值 |
| --- | --- |
| Service UUID | `7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c001` |
| State characteristic UUID | `7b71f91a-3c7b-4c3b-9f2d-2dbdccd5c002` |
| Characteristic 方向 | 桌面端写入，设备端接收 |
| 负载编码 | UTF-8 JSON |
| 设备名前缀 | `VibePet-Wio`、`VibePet-ESP-AI`、`VibePet-ESP-Display`、`VibePet-SenseCAP`、`VibePet-M5`、`VibePet-LILYGO`、`VibePet-Heltec`、`VibePet-WEMOS` |
| 兼容旧前缀 | `CodePet-Wio`、`CodePet-ESP-AI`、`CodePet-ESP-Display`、`CodePet-SenseCAP`、`CodePet-M5`、`CodePet-LILYGO`、`CodePet-Heltec`、`CodePet-WEMOS` |

BLE 设备需要广播 service UUID，并提供一个可写 characteristic。桌面应用会在活动桌宠状态变化或需要重发时写入一条紧凑 JSON。

## 紧凑设备包

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

| Key | 类型 | 说明 |
| --- | --- | --- |
| `v` | number | 协议版本，目前是 `1`。 |
| `s` | string | 桌宠状态，见 [状态](#状态)。 |
| `a` | string | Agent 名称，例如 `Codex`、`Cursor`、`Windsurf`。 |
| `e` | string | 来源事件名。 |
| `n` | number | 聚合后的活跃会话数量。 |
| `m` | string | 短会话标题或工作区目录名。 |
| `p` | string | 当前选择的角色 slug。 |
| `d` | string | 当前选择的角色显示名。 |
| `k` | string | 角色类型，例如 `builtin` 或 `petdex`。 |
| `u` | string | 可选的精灵图 URL 或资源路径。 |
| `ts` | number | 桌面端时间戳，单位毫秒。 |

彩色屏固件也兼容长字段，例如 `state`、`agentName`、`agent`、`event`、`title`、`activeCount` 和嵌套的 `persona` 字段。资源较少的设备可以忽略角色字段，只渲染本地简化角色。

## 状态

| 状态 | 建议设备表现 |
| --- | --- |
| `idle` | 平静待机动画。 |
| `thinking` | 思考、眼神移动或加载动画。 |
| `working` | 工具调用、编辑、运行命令等工作动画。 |
| `typing` | 文本输出动画。 |
| `building` | 更明显的工作或构建动画。 |
| `juggling` | 多任务动画。 |
| `attention` | 轻提示或本轮完成姿态。 |
| `notification` | 审批、授权或重要操作提醒。 |
| `error` | 错误颜色、抖动或告警姿态。 |
| `sweeping` | 上下文清理动画。 |
| `sleeping` | 睡眠或暗显状态。 |

`permission` 和 `codex-permission` 在硬件渲染前会由 bridge 规范化为 `notification`。

## Wi-Fi 设备快照

ESP8266 设备不提供 BLE，因此使用本地 Wi-Fi 轮询：

```text
GET /api/device-snapshot
```

响应包含面向硬件的桌宠列表，以及一个聚合 fallback：

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

显示固件应优先选择第一个状态不是 `idle` 或 `sleeping` 的桌宠。如果全部空闲，则选择第一个桌宠。如果 `pets` 为空，则渲染 `aggregate`。

## 角色同步

桌面 UI 允许每个桌宠选择不同角色。硬件通过下面字段收到对应身份：

| 字段 | 含义 |
| --- | --- |
| `p` | 角色 slug，用于显示缓存或稳定识别。 |
| `d` | 显示名，例如 `噜噜`。 |
| `k` | 角色来源或类型，例如 `builtin`、`petdex`。 |
| `u` | 精灵图 URL 或本地资源路径。 |

彩色屏可以根据这些字段选择配色、本地 sprite 或下载的 sprite。OLED 设备可以只显示同样的角色名和状态，并使用本地简化形象。

## 推荐设备实现

1. 广播 `VibePet-*` 设备名和 service UUID。
2. 提供可写 state characteristic。
3. 解析传入的 UTF-8 JSON。
4. 读取 `s`、`a`、`e`、`m`、`p`、`d`、`k`、`u` 和 `n`。
5. 忽略未知字段。
6. 字段缺失时回退到 `idle`、`agent` 和本地默认角色。
7. 收到格式错误的包时，保留上一条有效状态继续显示。

伪代码：

```cpp
void applyPacket(JsonVariantConst src) {
  String state = src["s"] | src["state"] | "idle";
  String agent = src["a"] | src["agentName"] | src["agent"] | "agent";
  String title = src["m"] | src["title"] | "";
  String persona = src["d"] | src["persona"]["displayName"] | "Lulu";
  renderPet(state, agent, title, persona);
}
```

## 安全边界

当前硬件协议是单向接收协议。设备不会向 bridge 回传 prompt、审批决策、工具输入或 transcript 内容。
