# Vibe42 底层架构拆解与横评：对比 Paseo、Orca 与自建开源栈的工程取舍

> 资料核对日期：2026 年 11 月 4 日。本文参考官网文档、开源仓库，并结合安装包分析。

随着 Claude Code、OpenAI Codex CLI、Gemini CLI、OpenCode、Pi 等命令行 AI 编程工具（Coding Agent）逐渐进入日常开发流程，开发者的交互重心正在从“在 IDE 里手写代码”转向“在终端里编排、审查和审批多个并行 Agent 任务”。这一转变催生了一个非常具体的工程刚需：**如何在离开工位（使用手机、平板或异地设备）时，低延迟、不断连地查看和调度家里或服务器上正在运行的本地 Agent？**

围绕这一需求，近期开发者社区演化出了四类侧重点不同的技术路线：

1. **底层终端透传与系统级打磨派**：以商业化的 **[Vibe42](https://vibe42.ai/zh-HANS)**（收录于 [VibeCafé 作品库](https://vibecafe.ai/products/cmsd01ldn00000al1ze0xlztd)）为代表，坚持 `Terminal-First`，用原生 GPU 渲染终端、P2P 自动打洞与文件系统写时复制（CoW）去重打磨底层管道。
2. **开源协议级控制面（Control Plane）派**：以 核对时官网显示约 23k Stars 的开源项目 **[Paseo](https://paseo.sh/)**（[getpaseo/paseo](https://github.com/getpaseo/paseo)，Apache-2.0 协议）为代表，将各类 Agent 抽象为统一的守护进程 API，提供全功能原生移动端、语音交互、跨 Agent 任务交接（Skills/MCP）与可自托管的 Elixir 加密中转。
3. **桌面重型多智能体工作台（ADE）+ 手机伴侣派**：以 MIT 开源的 **[Orca](https://github.com/stablyai/orca)**（`stablyai/orca`）为代表，围绕桌面端“多 Git Worktree 赛马对比、内置 Chromium 点选 UI（Design Mode）、行级 Diff 批注”构建重型编排器，并提供移动端 Companion 应用远程监控。
4. **开发者自建工具栈**：程序员自行拼凑 `Tailscale / WireGuard + Termius / Blink Shell + tmux / Mosh + 自定义推送脚本`。

本文从工程实现和使用场景出发，拆解 [Vibe42](https://vibe42.ai/zh-HANS) 的五个核心子系统，再与 **[Paseo](https://paseo.sh/)**、**[Orca](https://github.com/stablyai/orca)** 及**自建 Tailscale 方案**比较。重点是各自解决了什么问题，以及为此付出了什么代价。

## 一、 Vibe42 技术栈全景：它到底组装了什么？

如果剥离掉产品宣传语，从系统工程视角审视 [Vibe42](https://vibe42.ai/zh-HANS)，它的主要工作是将 **[libp2p](https://vibe42.ai/docs/how-it-works/connections) 网络穿透、Noise 端到端加密、`tmux` 会话管理、[Ghostty](https://github.com/ghostty-org/ghostty) 终端解析器以及现代文件系统的写时复制（CoW）特性**整合在了一起，并在中间补齐了对公开状态协议 `OSC 7501` 的支持、Agent 适配引擎与移动端推送链路。

它的整体技术栈可以归纳为以下六层：

| 架构分层 | 核心技术选型 | 实际承担的职责 |
| :--- | :--- | :--- |
| **网络传输层** | 边缘 AP（QUIC / TCP / WSS 出站连接）+ [libp2p DCUtR](https://github.com/libp2p/py-libp2p/discussions/869) 打洞 + 三通道分离 | 解决双内网无公网 IP 建连问题，并在文件传输与终端交互之间做流控隔离 |
| **安全加密层** | 本机 Ed25519 密钥对（设备本地保存）+ libp2p Noise 协议 | 在客户端与宿主机之间建立端到端加密（E2EE），防止中转节点窥探明文 |
| **会话持久层** | 宿主端管理的 `tmux` 会话 + 布局/工作区元数据本地持久化 | 保证手机断网或杀后台时 Agent 进程不退出，重连时同步屏幕缓存 |
| **终端渲染层** | [Ghostty](https://ghostty.org/) VT 解析器（`libghostty-vt` / WASM）+ 各平台渲染路径 | 解析 ANSI/VT 控制字节流，在各端显示全屏 TUI，并处理 CJK 字体排版 |
| **状态感知层** | 公开的 `OSC 7501` 状态协议 + 后台包装引擎（Wrapper Engine） | 接收 Agent 自报状态，或由适配引擎结合屏幕与会话记录识别，对接 APNs / FCM 锁屏推送 |
| **存储与工作区层** | 基于 APFS / ZFS / XFS / btrfs 的CoW 块共享、按文件系统支持的压缩与隔离副本 | 在不依赖 Root 和 FUSE 的前提下，降低多 Git Worktree 并行编译时的磁盘占用 |

## 二、 Vibe42 核心子系统原理拆解

### 1. 网络层：中转打底 + libp2p 打洞 + 多路通道隔离

家用宽带和移动蜂窝网络普遍处于运营商 NAT（网络地址转换）或防火墙之后，没有公网 IP，外部主动发起的入站连接常会被拦截。[Vibe42](https://vibe42.ai/zh-HANS) 采用的是典型的**“先中转保连通，后打洞降成本”**策略：

* **双向主动出站（Relay 打底）**：宿主机后台服务与客户端先主动连接官方边缘接入点（AP）。[连接文档](https://vibe42.ai/docs/how-it-works/connections)列出了香港、洛杉矶、东京、法兰克福等区域，以及 `QUIC → TCP → WSS` 的尝试顺序；仅允许出站 TCP 443 的网络可以使用 WSS。这样不需要用户手动配置公网 IP 或路由器端口映射，但仍依赖所在网络允许相应出站连接。
* **直连与 DCUtR 打洞（Hole Punching）**：中转建立后，原生端和 CLI 在后台交换候选地址，并尝试直拨和 NAT 打洞；成功后切换到 P2P，失败则继续中转。[官网文档](https://vibe42.ai/docs/how-it-works/connections)介绍了这条路径，安装包分析也能看到 libp2p DCUtR 等相关组件。DCUtR 负责协调双方建连，实际能否打通仍取决于网络环境。
* **三通道使用独立连接**：[连接文档](https://vibe42.ai/docs/how-it-works/connections)明确区分 `control`（元数据与管理）、`terminal`（终端交互）和 `file`（文件浏览、预览与传输）三条连接，而不只是给同一字节流贴三种消息标签。它们可以分别处于直连或中转状态。分开连接有助于减少文件传输与终端输入之间的排队干扰，但共享带宽、拥塞和设备负载仍会影响回显延迟。

### 2. 安全层：Noise 端到端加密与信任边界

由于未打通 P2P 前流量必须经过官方 AP 中转节点，如何保证源代码与环境变量（如 API Key）不泄露是核心安全诉求。

* **端到端加密握手**：根据[安全模型文档](https://vibe42.ai/docs/how-it-works/security)，每个客户端和后台服务在设备本地生成 Ed25519 根密钥对，私钥留在设备上；客户端与宿主机通过 Noise 建立端到端加密连接，AP 转发密文。这里描述的是公开文档中的安全模型，不能仅凭协议名推断整个实现已经经过独立安全审计。
* **短效配对与吊销**：[官方文档](https://vibe42.ai/docs/how-it-works/security)明确写明：配对码有效期为 **10 分钟**、只能使用一次；用户可以注销设备或移除电脑，吊销应在 **60 秒内**关闭活动连接，包括已建立的 P2P 连接。这是官方公布的行为约定，本文未独立测量其生效时间。
* **通知内容有不同的信任边界**：终端和文件流量的 E2EE，不等于所有内容都只在两个端点可见。[通知文档](https://vibe42.ai/docs/agents/notifications)说明，通知标题和正文会以服务端可读形式经过 Vibe42 并保存为通知历史，再交给 APNs、FCM 或 Telegram。通知可以包含任务摘要、工作目录或 Workspace 名称。关闭某台电脑的通知或相应事件类别，才会在电脑端停止生成和发送该类通知内容。

### 3. 渲染层：为什么不转成 Chat UI，而是用 Ghostty + GPU 渲染？

市面上不少远程 Agent 工具（包括 [Paseo](https://paseo.sh/) 的主会话视图）会将 Agent 的输出解析并呈现为结构化的对话流与工具调用卡片，但 [Vibe42](https://vibe42.ai/zh-HANS) 选择了直接渲染原生终端屏幕。

原因在于，Claude Code、Codex CLI 等工具在终端内运行时是重度依赖伪终端（PTY）的全屏 **TUI（终端用户界面）**程序。它们向标准输出（`stdout`）发送的是高频刷新的 **ANSI/VT 转义控制码**（包含光标绝对定位、局部清屏、24 位真彩色背景框、动态进度条与字符画边框）。直接渲染终端的好处是尽量保留 CLI 工具的原生交互（如交互式多选菜单、内联 Diff、甚至是直接在里面开 Neovim 改代码），不需要为每个新出的 Agent 单独写一套 UI 适配层。

为了解决手机 CPU 排版高频 TUI 字符网格（尤其是 CJK 双宽中文字符与半宽英文混排）时的卡顿与发热问题，[Vibe42](https://vibe42.ai/zh-HANS) 做了两层设计：

1. **统一内嵌 Ghostty VT 解析核心**：在客户端集成 [Ghostty](https://github.com/ghostty-org/ghostty) 的 `libghostty-vt` 库（Web 端使用编译为 WebAssembly 的 `ghostty-vt`），在内存中高速处理 VT 状态机，维护准确的字符网格（Cell Grid）状态。
2. **按平台选择渲染路径**：[官方终端引擎文档](https://vibe42.ai/docs/terminal/engine)列出：macOS / iOS 使用 **Metal**，Linux 使用 **wgpu**，Android 通过 **TextureView** 呈现，Web 使用 **WebGL**，并可回退到 **Canvas 2D**。TextureView 是 Android 视图组件，不能与 Metal 等同为同一层级的底层图形 API。帧更新跟随设备屏幕刷新率；官网宣传支持 120Hz，不等于任何设备、网络和负载下都稳定达到 120fps。Kitty 图形协议和 OSC 52 剪贴板支持也有直接文档说明。

### 4. 会话与状态感知层：`tmux` 保活与 `OSC 7501` 协议的分工

移动端远程控制必须解决两个正交的问题：**断连后的画面恢复**，以及**后台断开时的事件通知**。

* **进程与画面恢复靠 `tmux`**：[会话文档](https://vibe42.ai/docs/how-it-works/sessions)说明，Vibe42 管理自己的 `tmux` 会话，不干扰用户默认会话。手机断网或切后台时关闭客户端连接，宿主机上的程序继续运行。**宿主机重启则是另一回事**：原进程会停止，后台服务随后重建窗口、回放保存的输出，并重新启动命令；支持恢复会话的 Agent 可以重新打开本地保存的对话，但重启时被打断的一轮任务不会自动继续执行。
* **语义状态感知靠 `OSC 7501` 与包装引擎**：`tmux` 只负责保存字符矩阵，无法理解里面的程序处于“正在编写代码”还是“卡在权限审批 `[Y/n]` 等待人工干预”。为此，[Vibe42](https://vibe42.ai/docs/agents/osc-7501) 采用公开的 **Program Status Protocol（`OSC 7501`）**（以 `\x1b]7501;...` 开头的不可见转义指令），并设计了三档适配策略：
  1. **原生直报**：已集成该协议的 Agent（如 Claude Code ≥ 2.1.295、Pi Coding Agent）直接在输出流中打印 `OSC 7501` 状态帧，上报当前状态、进度及暂停原因。
  2. **混合补齐**：部分上报的工具（如 OpenAI Codex CLI、OMP、Grok Build），由宿主机侧的包装引擎（Wrapper Engine）结合屏幕规则和本地会话记录补全状态。
  3. **引擎代报**：未接入协议的工具（如 Gemini CLI、Cursor Agent、Devin CLI、GitHub Copilot CLI），由后台包装引擎结合屏幕模式与本地会话记录识别“等待确认”或“任务结束”状态，再通过云端网关触发苹果 APNs 或谷歌 FCM 推送通知。

### 5. 存储与工作区层：基于 CoW 的去重与隔离副本

在多 Agent 并行工作流中，开发者常通过 Git Worktree 创建多个工作目录让不同 Agent 同时改代码、跑编译。对于 Rust、C++ 等编译型语言，每个工作区动辄产生数十 GB 的 `target/` 构建产物，极易耗尽本地磁盘。

在 [v0.13.1 版本](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)中，Vibe42 引入了工作区压缩去重与**实验性的手动快照隔离**。当前官网已分别提供[存储去重](https://vibe42.ai/docs/workspaces/storage-dedup)和[终端隔离](https://vibe42.ai/docs/workspaces/terminal-isolation)文档；历史版本的实验标记不能直接用来判断当前版本的成熟度：

* **由用户态服务协调文件系统能力**：v0.13.1 发布说明称，这些功能不需要 root 或 FUSE。不同文件系统的能力并不相同：APFS 使用内容去重与 `decmpfs / LZFSE` 压缩，btrfs 使用去重与 `zstd`，**XFS 仅支持去重，不提供透明压缩**，ZFS 依赖启用 block cloning 的 OpenZFS，其压缩由 dataset 属性控制。不能把四者写成完全相同的一套“CoW + 压缩”机制。
* **实际存储收益**：根据官方在 [VibeCafé 披露的 400GiB 级 Rust 项目实测数据](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)，其单次耗时约 76 分钟，转换了 176,904 个文件，将 206.4 GiB 数据压缩至 67.5 GiB（约为原体积的 33%），并消除了 65.74 GiB 的重复块，总计释放超过 154 GiB 可用空间。这些是官方单个项目的测量结果，不是通用节省比例。终端隔离则为每个窗口创建整个工作目录的 CoW 副本，同一窗口中的分屏共用副本；它解决工作副本之间的文件干扰，不能直接等同于容器、进程权限或网络隔离。

## 三、 Vibe42 的架构亮点与工程优势（Pros）

1. **克制的“零侵入”边界与强兼容性**：它没有试图去包裹或改写 Agent 的交互协议，不代理大模型 API 请求，也不污染本地配置文件。终端透传减少了为每种 CLI 重写交互界面的工作；状态识别和推送则仍需要 Agent 原生上报或包装引擎适配。
2. **自带 P2P 自动打洞与远程桌面兜底**：相比纯靠 WebSocket 中转或要求用户先手动装好 Tailscale 的方案，它把 `边缘 AP 中转 + libp2p DCUtR 自动打洞直连` 做成了零配置闭环；而且除了终端，还内置了支持多显示器与 Linux X11/Wayland 的**完整远程桌面控制**（[Vibe42 v0.13.1 发布说明](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)），当遇到必须点 GUI 窗口或看模拟器画面的场景时能够兜底。
3. **贴合移动端特性的连接管理**：切后台时关闭客户端连接，宿主机上的 Agent 继续运行；通知通过 APNs / FCM 等服务送达，回到前台后重连。相比依赖手机持续保持 SSH 连接，这条路径更适合移动端使用，但本文没有进行耗电量或恢复延迟实测。
4. **深入文件系统层的 CoW 存储去重**：针对 `Rust + Git Worktree` 多 Agent 并行开发导致磁盘爆满的痛点，直接利用 APFS / btrfs / XFS 的 CoW 能力做块共享去重和工作副本隔离，无需为这项功能引入容器或 FUSE（[Vibe42 v0.13.1 发布说明](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)）。

## 四、 Vibe42 的局限性、短板与架构妥协（Cons & Trade-offs）

1. **商业闭源与移动蜂窝网络下的中转计费压力**：
   与开源的 [Paseo](https://github.com/getpaseo/paseo) 和 [Orca](https://github.com/stablyai/orca) 不同，Vibe42 的个人套餐按月付费，官网核对时 Basic 为 $8/月、Pro 为 $25/月，并包含每月中转 Credits 额度。[计费文档](https://vibe42.ai/docs/account/credits-and-usage)写明 **64 MiB = 1 Credit**，AP 的入站和出站两段分别计量：一段经 AP 转发的 64 MiB 应用数据合计记 2 Credits。**原生端直连流量为 0 Credits，网页端固定使用中转**；额度耗尽会暂停中转数据连接。严格 NAT 或只允许出站 443 的网络可能使原生端长期依赖中转，需要结合自己的网络查看诊断结果。当前公开部署文档以官方 AP 为主，未提供自建 AP 的部署流程。
2. **手机端“纯终端 TUI”在小屏幕上的交互局促感**：
   GPU 渲染改善的是终端显示路径。在几英寸的手机竖屏上阅读桌面级宽度的字符网格、长篇代码 Diff 或输入复杂指令，仍有操作成本；结构化移动 GUI 通常更容易组织这些信息（如 Paseo 专门为手机设计的原生会话流、结构化 Diff 审查树与本地语音输入）。
3. **“第三档”屏幕流状态解析的脆弱性**：
   对于未原生接入 `OSC 7501` 的 Gemini CLI、Cursor Agent 等工具，Vibe42 依赖后台包装引擎结合屏幕模式与本地会话记录识别状态。一旦上游 CLI 工具改版了 TUI 输出格式，在官方更新规则前可能出现推送漏报或误判。
4. **编排入口以 CLI 为主，与协议控制面的抽象不同**：
   Vibe42 并非“只有分屏、没有自动化”。公开的 [`v42` CLI](https://vibe42.ai/docs/cli/overview)已支持创建和附着终端、启动 Agent、文件同步、端口转发、网络诊断和隔离副本管理，并提供 JSON 输出及[自动化示例](https://vibe42.ai/docs/cli/automation)。开发者可以据此编写跨机器、跨 Agent 的脚本。与 Paseo 的 MCP、SDK 和 Skills 相比，Vibe42 当前公开的自动化接口更接近远程终端和工作区控制；不能因为它没有同样的交接界面，就断言无法编排。
5. **物理宿主机单点依赖与文件系统限制**：
   宿主机休眠、断电或 OOM 卡死即不可用；且 v0.13.1 的存储去重强依赖 APFS、ZFS、XFS、btrfs，传统 `ext4` 或 Windows NTFS 分区无法享受同等红利。

## 五、 同赛道深度横评：Vibe42 vs. Paseo vs. Orca vs. 自建栈

在当前的远程/多智能体开发工具赛道中，**[Paseo](https://paseo.sh/)** 与 **[Orca](https://github.com/stablyai/orca)** 是本文选取与 [Vibe42](https://vibe42.ai/zh-HANS) 对照的两个开源方案。尤其是 **Paseo**，在产品形态与覆盖场景上与 Vibe42 高度重合，但底层设计哲学截然不同。

### 1. 焦点对决：Vibe42 vs. Paseo（终端透传派 vs. 开源协议控制面派）

[Paseo](https://paseo.sh/)（[getpaseo/paseo](https://github.com/getpaseo/paseo)）是由独立开发者维护、采用 **Apache-2.0 协议完全开源**的跨平台 Agent 开发环境（支持 iOS、[Android](https://play.google.com/store/apps/details?id=sh.paseo)、桌面端、Web 与 CLI）。把两者放在一起拆解，能清晰看到两种不同的工程路线：

* **交互抽象层：Vibe42 渲染“字符画屏幕”，Paseo 抽象“结构化协议”**
  * **Vibe42** 把 Agent 当作黑盒终端进程，用 `tmux + libghostty-vt` 把原始终端画面搬到手机上，再用 `OSC 7501` 旁路抽状态。
  * **Paseo** 则采用类似 Docker 的 `Client-Daemon` 架构（`packages/server` 守护进程）。它针对 Claude Code、Codex、OpenCode、Pi 等内置了专门的 **Provider 适配器与 ACP（Agent Client Protocol）支持**（[Paseo 官网](https://paseo.sh/)）。因此在 Paseo 的原生手机 App（基于 Expo / React Native 构建的移动界面）里，你看到的不仅是终端，而是**结构化的对话流、清晰的 Diff 文件修改树、PR 状态、定时任务（Schedules）以及本地离线的语音输入（On-device Voice）**（[Paseo App Store](https://apps.apple.com/us/app/paseo-remote-coding-agents/id6758887924)）。在手机小屏幕上审阅代码改动和语音下发指令时，Paseo 的结构化界面更贴近这种使用方式；具体效率仍取决于任务和个人习惯。
* **网络与远程连接：Vibe42 赢在“自动 P2P 打洞”，Paseo 赢在“全开源免费 + 可自建 Relay”**
  * **Vibe42** 的优势是内置了 [libp2p DCUtR](https://github.com/libp2p/py-libp2p/discussions/869) 自动打洞，不装 Tailscale 也有机会直连免流；但一旦打不通走中转，就必须按量消耗付费 Credits，且公开文档未给出自建 AP 的部署方式。
  * **Paseo** 不做复杂的 UDP NAT 打洞，而是提供三条透明路径：① 直接使用官方免费的端到端加密中转服务（`wss://relay.paseo.sh`）；② 直接绑定你自己的 Tailscale IP、Cloudflare Tunnel 或 SSH 隧道（[Paseo Connectivity 文档](https://paseo.sh/docs/connectivity)）；③ **连中转服务器源码都完全开源**（[getpaseo/paseo-relay](https://github.com/getpaseo/paseo-relay)，基于 Elixir/OTP 与 Cowboy/Syn 编写），开发者可以按部署说明，在自己的服务器上运行 Relay，并配置 TLS 和访问入口（[Paseo 中文 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)）。
* **多 Agent 编排与扩展能力：Paseo 提供更直接的控制面接口（MCP / SDK / Skills / 400+ 插件）**
  * **Vibe42** 提供持久化终端、隔离副本和 `v42` CLI，能够作为脚本化自动化的基础；更高层的任务交接逻辑需要开发者组合这些能力。
  * **Paseo** 的守护进程本身就是一个 **MCP Server**，并提供完整的 CLI（`paseo run` / `paseo attach` / `paseo send`）与 TypeScript SDK（[Paseo 中文 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)）。它原生支持通过 Skills 实现跨 Agent 协同：比如敲 `/paseo-handoff`，先让 Claude Opus 做好架构规划，然后一键把上下文无缝交接给 Codex 写代码；或者用 `/paseo-committee` 拉起两个不同模型的 Agent 联合会诊 Bug（[Paseo 中文 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)）。官网列出了 400+ 社区插件，甚至支持在手机上直接对 Agent 说“帮我在侧边栏加个待审 PR 面板”，Agent 就能现场写一个本地插件并热加载进 Paseo 界面，无需重启（[Paseo 官网](https://paseo.sh/)）。
* **底层系统能力：Vibe42 赢在“CoW 磁盘去重”与“完整远程桌面”**
  * **Paseo** 的工作区隔离基于标准的 `git worktree`（默认存放在 `$PASEO_HOME/worktrees/` 下）（[Paseo Worktrees 文档](https://paseo.sh/docs/worktrees)）。如果你开 5 个 Worktree 并行编译大型 Rust 项目，标准 Worktree 本身不会自动消除各目录中新产生的构建产物；是否占满磁盘还取决于项目规模、缓存共享和清理策略；而 **[Vibe42 v0.13.1](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)** 深入到了 APFS / btrfs / XFS 的 CoW 去重与快照隔离。
  * 此外，如果你除了看终端和代码 Diff，还需要远程操作宿主电脑的 GUI 桌面（比如点一下模拟器、过一下桌面端 OAuth 弹窗），**Vibe42** 内置了远程桌面，本文未在 **Paseo** 的公开文档中看到同类完整远程桌面功能。

### 2. 再看 Orca（`stablyai/orca`）：桌面端重度并行的“赛马场”

[Orca](https://github.com/stablyai/orca)（MIT 开源）虽然也支持连接远程服务器（SSH Worktree）并提供了 iOS/Android 移动伴侣应用（[Orca 中文 README](https://github.com/stablyai/orca/blob/main/docs/readme/README.zh-CN.md)），但它的架构重心与 Vibe42、Paseo 有明显错位：

* **桌面端是绝对核心（ADE 定位）**：Orca 的重点在于桌面端的工作流整合——比如把同一个 Prompt 同时发给 5 个处于独立 Git Worktree 的不同 Agent 跑“赛马”并对比择优；内置真实的 **Chromium 浏览器设计模式（Design Mode）**，直接用鼠标点选页面上的按钮就能把 HTML、CSS 和裁剪截图塞进 Agent 提示词；支持在 AI 生成的 Diff 任意行上写批注评论打回重改；以及原生集成 GitHub PR 与 Linear 看板（[Orca 中文 README](https://github.com/stablyai/orca/blob/main/docs/readme/README.zh-CN.md)）。
* **移动端偏重“伴侣监控”而非“独立主控”**：Orca 的手机端（基于 React Native，通过端口 6768 的 WebSocket RPC 或 Orca Relay 与桌面端通信）（[orca/mobile 文档](https://github.com/stablyai/orca/blob/main/mobile/README.md)）主要是为了让你在离开桌面 Orca 时查看进度、接收通知和补发指令，其文档定位是围绕桌面工作区提供远程监控与操作，选择时应结合自己的移动端任务验证。

### 3. 四大方案全景对比表

| 评估维度 | [Vibe42](https://vibe42.ai/zh-HANS) | [Paseo](https://paseo.sh/) ([getpaseo/paseo](https://github.com/getpaseo/paseo)) | [Orca](https://github.com/stablyai/orca) (`stablyai/orca`) | 自建栈（Tailscale + Termius + tmux） |
| :--- | :--- | :--- | :--- | :--- |
| **开源与商业模式** | **商业订阅**（个人月付 $8 / $25，含中转 Credits 额度） | **开源**（Apache-2.0，含客户端、Daemon；Relay 也可自托管） | **开源**（MIT 协议，主仓库公开） | **可低成本自建**（另计客户端、服务器和维护成本） |
| **核心交互范式** | **原生终端 TUI 透传**（Ghostty，按屏幕刷新率渲染）+ 远程桌面 | **结构化 Agent 控制面**（原生对话流、Diff 树、语音、终端一体） | **桌面重型多 Agent IDE**（分屏赛马、Chromium 点选、行级批注） | **纯传统 SSH 终端**（无任何 AI 语义感知） |
| **远程网络架构** | 官方边缘 AP 中转 + **libp2p DCUtR 自动打洞直连** | 官方免费加密 Relay / **可自建私有 Relay** / 原生支持 Tailscale & SSH | 桌面端 WebSocket RPC + Orca Cloud Relay / 远程 SSH Worktree | 依赖用户自行配置 Tailscale / WireGuard 虚拟局域网 |
| **多 Agent 协同与生态** | 持久化终端、隔离副本与 `v42` CLI；可自行编写编排脚本 | MCP Server、CLI/SDK、Skills 交接与插件 API | 单 Prompt 多 Worktree 并行比较、CLI 自动化 | 可用自写脚本编排，需自行维护 |
| **工作区与存储隔离** | **CoW 去重与工作副本隔离**（压缩能力因文件系统而异） | 标准 `git worktree` 分支目录隔离 + 生命周期 Hook（无底层块去重） | 标准本地/SSH `git worktree` 隔离（无底层块去重） | 可手动或脚本化管理 Worktree、缓存与目录 |
| **移动端与特殊能力** | 高刷终端、`OSC 7501` 状态与系统推送、**支持完整 GUI 远程桌面** | 全功能原生移动 App、**本地离线语音输入**、热加载修改自身 UI | 移动 Companion 伴侣监控、桌面端 **Chromium UI 点选截图** | 仅普通手机 SSH 敲命令，后台易断连，无原生 AI 推送 |
| **私有化与合规性** | 公开部署入口依赖官方控制面与 AP；通知内容有独立的数据边界 | **可自托管 Daemon 与 Relay**（模型调用仍取决于所选 Agent） | 本地优先（含可退出的匿名遥测），远程支持纯 SSH 接入 | **可自托管组网组件**（如 Headscale / DERP，需自行运维） |

## 六、 最终总结：作为程序员，到底该怎么选？

结合这些公开实现和文档，**没有任何一款工具能在所有维度通吃，它们各自代表了不同维度的工程取舍**：

1. **优先考虑 [Paseo](https://paseo.sh/) 的场景**
   如果你主要想在手机、平板和电脑之间无缝调度 Claude Code、Codex、OpenCode 等工具，**Paseo 值得先试**。它不仅 Apache-2.0 完全开源免费（连 Elixir 写的分布式加密 Relay 都能自己部署），而且它没有停留在“把黑底白字的终端缩放到手机屏幕上”，而是真正做出了适配移动端的 Diff 审查、本地语音输入，以及通过 MCP 和 `/paseo-handoff` 让不同 Agent 接力干活的编排层。如果你的重点是移动端审查、语音输入、跨 Agent 交接或私有 Relay，这些能力值得优先验证。开源软件本身不收费，并不包含模型订阅、托管和维护成本。
2. **什么情况下 [Orca](https://github.com/stablyai/orca) 更适合你？**
   如果你的主力场景还是坐在电脑前，想要一个专门为“同时开 5 个 Agent 赛马写需求、在内置浏览器里直接点选前端 DOM 元素喂给 AI、像审 GitHub PR 一样逐行批注 AI 改出的代码”而生的**桌面工作台**，手机端只是偶尔出门时瞄一眼进度，那么 Orca 的桌面工作流更贴近你的需求，尤其适合把前端界面修改和代码审查放在同一个工作区中处理。
3. **那商业收费的 [Vibe42](https://vibe42.ai/zh-HANS) 到底凭什么立身？什么人值得为它掏钱？**
   与 Paseo、Orca 相比，Vibe42 更突出的差异是**终端兼容、连接管理、远程桌面和文件系统能力的整合**：
   * 第一，你是**更习惯原生终端交互的开发者**，不喜欢任何工具把 Claude Code 或 Neovim 的原生 TUI 界面转换成聊天卡片，希望在移动端继续使用 Ghostty 终端和持久化 `tmux` 会话；
   * 第二，你是 **Rust / C++ 等大型编译型项目的重度多开用户**，开五六个 Git Worktree 真的会把 Mac 硬盘撑爆，Vibe42 的去重、按文件系统支持的压缩和 CoW 隔离副本值得在自己的项目上测量收益；
   * 第三，你除了命令行 Agent，偶尔还**必须用到完整的 GUI 远程桌面**去点一下电脑屏幕上的其他软件，且希望完全免折腾地享受 `libp2p` 自动打洞直连。
   如果这些能力能减少你日常的配置和维护工作，订阅就有比较的价值。决定前应在常用网络上检查直连比例，并估算网页端或远程桌面的中转额度消耗，而不是只比较月费。
4. **至于自建 `Tailscale + SSH + tmux`**：
   适合本来就有家庭 Homelab 组网基础、平时很少在手机上重度操作 Agent、只需要偶尔连回家敲两行命令看一眼的极客——可以复用已有工具；客户端订阅、服务器费用、推送脚本与维护时间仍要单独计算。

## 资料与核验说明

以下是本文关键技术判断的直接来源。官网功能、价格和支持范围会变化，数字以本次核对时的页面为准。

| 核对项 | 依据与结论边界 |
| :--- | :--- |
| 三通道与连接回退 | [Vibe42 连接文档](https://vibe42.ai/docs/how-it-works/connections)：`control`、`terminal`、`file` 是独立连接，可混合使用直连与中转。 |
| 配对与吊销 | [安全模型](https://vibe42.ai/docs/how-it-works/security)：10 分钟配对码、60 秒内吊销。本文未测量实际生效时间。 |
| 网页中转与流量计量 | [Credits 文档](https://vibe42.ai/docs/account/credits-and-usage)：网页固定中转，64 MiB / Credit，AP 入站与出站分别计量，套餐包含每月额度。 |
| Ghostty 与各端渲染 | [终端引擎](https://vibe42.ai/docs/terminal/engine)：Metal、wgpu、TextureView、WebGL / Canvas 2D。TextureView 表示视图路径，120Hz 是支持能力。 |
| Agent 状态适配 | [支持列表](https://vibe42.ai/docs/agents/supported-agents)、[OSC 7501 规范](https://vibe42.ai/docs/agents/osc-7501)：原生、混合和引擎代报。包装引擎须通过 Vibe42 的启动流程或 `v42 term new --agent` 接入。 |
| 推送内容的边界 | [通知链路](https://vibe42.ai/docs/agents/notifications)：通知标题和正文对 Vibe42 及相应推送服务可读，并与终端、文件的 E2EE 数据通道区分。 |
| CoW 与压缩 | [去重支持矩阵](https://vibe42.ai/docs/workspaces/storage-dedup)、[隔离副本](https://vibe42.ai/docs/workspaces/terminal-isolation)：XFS 仅去重；文件副本隔离不等于进程、网络权限隔离。 |
| Vibe42 自动化 | [CLI 概览](https://vibe42.ai/docs/cli/overview)、[自动化示例](https://vibe42.ai/docs/cli/automation)：已有 JSON-first CLI，不能描述成只有分屏。 |
| Paseo 架构与扩展 | [项目 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)、[连接文档](https://paseo.sh/docs/connectivity)、[Worktree 文档](https://paseo.sh/docs/worktrees)。 |
| Orca 定位与移动端 | [项目 README](https://github.com/stablyai/orca/blob/main/docs/readme/README.zh-CN.md)、[Mobile README](https://github.com/stablyai/orca/blob/main/mobile/README.md)。 |

本文也分析了 Vibe42 的官方安装包，用来核对它使用的网络组件。
