# Vibe42 底层架构拆解与横评：对比 Paseo、Orca 与自建开源栈的工程取舍

> 资料核对日期：2026 年 11 月 4 日。本文基于各项目官网文档、开源仓库及 Vibe42 官方安装包拆解整理。

现在用 Claude Code、OpenAI Codex CLI、Gemini CLI、OpenCode、Pi 这类命令行 Agent 写代码的人越来越多，大家日常的工作流也在变：以前是坐在电脑前对着 IDE 一行行敲，现在更多是在终端里同时挂起几个 Agent，盯着它们改代码、跑测试、过审批。

工作方式一变，一个很具体的问题就出来了：**人离开工位之后（比如在地铁上掏出手机、在沙发上拿 iPad，或者用异地笔记本），怎么低延迟、不断连地看一眼家里或服务器上跑着的本地 Agent，顺手批个权限、发条后续指令？**

围绕这个场景，目前社区里长出了四条路子：

1. **死磕原生终端透传与系统底层的商业方案**：代表是 **[Vibe42](https://vibe42.ai/zh-HANS)**（收录于 [VibeCafé 作品库](https://vibecafe.ai/products/cmsd01ldn00000al1ze0xlztd)）。它坚持 `Terminal-First`，不把终端改成聊天框，而是把功夫花在 GPU 终端渲染、P2P 自动打洞和文件系统写时复制（CoW）去重上。
2. **开源协议级控制面（Control Plane）**：代表是核对时官网标称约 23k Stars 的开源项目 **[Paseo](https://paseo.sh/)**（[getpaseo/paseo](https://github.com/getpaseo/paseo)，Apache-2.0 协议）。它把不同 Agent 统一收口到一套守护进程 API 下，配齐了原生手机端、本地语音输入、跨 Agent 任务交接（Skills/MCP），连 Elixir 写的加密中转服务都能自己部署。
3. **重型桌面多智能体工作台（ADE）+ 手机伴侣**：代表是 MIT 开源的 **[Orca](https://github.com/stablyai/orca)**（`stablyai/orca`）。重心放在桌面端的“多 Git Worktree 赛马对比、内置 Chromium 点选页面元素（Design Mode）、行级 Diff 批注”，手机端则作为 Companion 应用负责出门在外时盯进度。
4. **自己动手攒一套开源工具链**：不少老手直接用 `Tailscale / WireGuard + Termius / Blink Shell + tmux / Mosh + 自写推送脚本` 拼一套环境。

这篇文章不聊概念，直接从工程实现和实际使用场景出发，先拆开 [Vibe42](https://vibe42.ai/zh-HANS) 的五个核心子系统，看看它到底做了什么；再把它和 **[Paseo](https://paseo.sh/)**、**[Orca](https://github.com/stablyai/orca)** 以及**自建 Tailscale 方案**放在一起比一比，看看各自解决了哪些痛点，又为此付出了什么代价。

## 一、 Vibe42 技术栈全景：它到底把哪些积木拼在了一起？

如果把宣传语滤掉，单纯从系统工程的角度看，[Vibe42](https://vibe42.ai/zh-HANS) 干的核心活儿就是把 **[libp2p](https://vibe42.ai/docs/how-it-works/connections) 网络穿透、Noise 端到端加密、`tmux` 会话管理、[Ghostty](https://github.com/ghostty-org/ghostty) 终端解析器，以及现代文件系统的写时复制（CoW）特性**揉成了一个整体，再在中间补上公开状态协议 `OSC 7501`、Agent 状态包装引擎和手机系统级推送。

按架构分层来看，它的六层底盘分工如下：

| 架构分层 | 核心技术选型 | 实际解决的问题 |
| :--- | :--- | :--- |
| **网络传输层** | 边缘 AP（QUIC / TCP / WSS 出站连接）+ [libp2p DCUtR](https://github.com/libp2p/py-libp2p/discussions/869) 打洞 + 三通道独立连接 | 解决双内网无公网 IP 的连通问题，把文件传输和终端敲命令的流量隔开 |
| **安全加密层** | 本机生成并保存的 Ed25519 密钥对 + libp2p Noise 协议 | 在客户端与宿主机之间做端到端加密（E2EE），中转节点只过密文 |
| **会话持久层** | 宿主端独立管理的 `tmux` 会话 + 本地持久化的布局与工作区元数据 | 手机断网、切后台时不杀 Agent 进程，重连后直接恢复屏幕缓存 |
| **终端渲染层** | [Ghostty](https://ghostty.org/) VT 解析器（`libghostty-vt` / WASM）+ 各平台原生渲染管线 | 高速解析 ANSI/VT 控制字节流，还原全屏 TUI 并处理中日韩（CJK）混排 |
| **状态感知层** | 公开的 `OSC 7501` 状态协议 + 后台包装引擎（Wrapper Engine） | 接收 Agent 自报状态，或结合屏幕输出与本地会话记录识别状态，触发 APNs / FCM 推送 |
| **存储与工作区层** | 基于 APFS / ZFS / XFS / btrfs 的 CoW 块共享、按文件系统支持的透明压缩与隔离副本 | 在不依赖 Root 权限和 FUSE 的前提下，压降多 Git Worktree 并行编译的磁盘占用 |

## 二、 Vibe42 五大子系统拆解

### 1. 网络层：中转保底 + libp2p 打洞 + 三通道分离

家里宽带和手机流量基本都在运营商 NAT 或防火墙后面，没有公网 IP，外部直接发起的入站连接大概率会被拦掉。[Vibe42](https://vibe42.ai/zh-HANS) 走的是很务实的**“先靠中转连上，后台再打洞切直连”**路子：

* **双向主动出站（Relay 保底）**：宿主机后台和客户端先主动连向官方边缘接入点（AP）。从[官方连接文档](https://vibe42.ai/docs/how-it-works/connections)来看，目前节点覆盖香港、洛杉矶、东京、法兰克福等区域，按 `QUIC → TCP → WSS` 的顺序降级尝试；如果公司或公共网络只放行出站 TCP 443，也能退回到 WSS 连上。这样省去了配公网 IP 或折腾路由器端口映射的麻烦，前提是当前网络得放行对应的出站连接。
* **直连与 DCUtR 打洞（Hole Punching）**：中转连上之后，原生客户端、宿主机后台服务和 CLI 会在后台交换候选地址，尝试直拨和 NAT 打洞；打通了就无感切到 P2P 直连，打不通就继续走中转兜底。[官网文档](https://vibe42.ai/docs/how-it-works/connections)明确写了这套流程，拆解官方安装包也能看到 `libp2p DCUtR` 相关组件。当然，DCUtR 只是负责协调双方同步打洞，最终能不能直连成功，还是得看两端的 NAT 类型和网络环境。
* **三通道跑在独立连接上**：根据[连接文档](https://vibe42.ai/docs/how-it-works/connections)，Vibe42 把 `control`（元数据与控制）、`terminal`（终端交互）和 `file`（文件浏览、预览与传输）拆成了三条独立连接，而不是在同一个字节流里贴标签混跑。三条连接可以各自独立处于直连或中转状态。这种设计能避免传大文件时把终端敲命令的回显堵死，不过要是总带宽本来就满了、网络拥塞或者设备负载过高，终端延迟还是会受影响。

### 2. 安全层：Noise 端到端加密与通知的数据边界

既然打不通 P2P 时流量得过官方 AP 中转，怎么保证源码和环境变量（比如各种 API Key）不被中转节点看到，就是最核心的安全问题。

* **端到端加密握手**：按照[安全模型文档](https://vibe42.ai/docs/how-it-works/security)，客户端和宿主机后台都会在本地生成 Ed25519 根密钥对，私钥不出设备；两端通过 Noise 协议完成端到端加密握手，AP 节点只负责转发密文。需要注意，这里说的是公开文档里的加密设计，协议本身安全不代表整套闭源实现已经过第三方独立安全审计。
* **短效配对码与快速吊销**：[官方文档](https://vibe42.ai/docs/how-it-works/security)给出的规则是：配对码 **10 分钟**内有效且只能用一次；手动注销设备或移除电脑后，系统会在 **60 秒内**掐断所有活动连接（包括已经建立的 P2P 连接）。这是官方文档给出的机制说明，本次未单独掐表实测。
* **推送通知的信任边界不一样**：终端交互和文件传输是端到端加密的，但**推送通知是个例外**。[通知文档](https://vibe42.ai/docs/agents/notifications)写得很清楚：通知的标题和正文需要经过 Vibe42 服务端读取并存为通知历史，然后再转发给苹果 APNs、谷歌 FCM 或 Telegram。这些通知里可能带有任务摘要、工作目录或 Workspace 名称。如果你对这部分信息敏感，需要在设置里关掉对应电脑的通知或特定事件类别，宿主机端才会彻底停止生成和上报这类通知文本。

### 3. 渲染层：为什么不做成聊天框，非要用 Ghostty + GPU 渲染？

市面上不少远程 Agent 工具（比如 [Paseo](https://paseo.sh/) 的主会话界面）会把 Agent 的输出解析成清爽的聊天流和工具调用卡片，但 [Vibe42](https://vibe42.ai/zh-HANS) 偏偏选择了直接渲染原生终端屏幕。

这背后的工程考量很简单：像 Claude Code、Codex CLI 这些工具，跑起来其实是重度依赖伪终端（PTY）的全屏 **TUI（终端用户界面）**程序。它们往标准输出（`stdout`）里吐的不是普通文本，而是高频刷新的 **ANSI/VT 转义控制序列**——包括光标绝对定位、局部清屏、24 位真彩色背景框、动态进度条和字符边框。直接渲染原生终端，最大的好处是尽量保留 CLI 原生的交互细节（比如上下键多选菜单、内联 Diff 视图，甚至直接在里面切个 Neovim 改两行代码），新出的 CLI 工具通常也能直接在终端里运行，不用挨个去写 UI 解析器。

但在手机上直接跑高频刷新的 TUI 字符网格（尤其是中英文等宽/双宽字符混排），纯靠 CPU 排版很容易掉帧发热。为此 [Vibe42](https://vibe42.ai/zh-HANS) 做了两层处理：

1. **统一内嵌 Ghostty VT 解析核心**：客户端直接集成了 [Ghostty](https://github.com/ghostty-org/ghostty) 的 `libghostty-vt` 库（Web 端则是编译成 WebAssembly 的 `ghostty-vt`），在内存里高速跑 VT 状态机，维护准确的字符网格（Cell Grid）状态。
2. **分平台走图形渲染管线**：根据[官方终端引擎文档](https://vibe42.ai/docs/terminal/engine)，macOS / iOS 走 **Metal**，Linux 走 **wgpu**，Android 通过 **TextureView** 呈现，Web 端用 **WebGL**（不支持时回退到 **Canvas 2D**）。这里顺带一提，Android 的 TextureView 属于系统视图组件，跟 Metal、wgpu 这种底层图形 API 不是同一个层面的概念。终端帧率会跟随设备屏幕刷新率，官方宣传支持 120Hz，实际能不能跑满还得看设备性能、网络和当时刷屏的负载。此外，文档中也明确支持 Kitty 图形协议和 OSC 52 剪贴板同步。

### 4. 会话与状态感知层：`tmux` 管保活，`OSC 7501` 管通知

在手机上远程控电脑，有两个互相独立的问题必须解决：**断网重连后画面怎么接上**，以及**App 切到后台断连时怎么知道 Agent 跑完了没**。

* **进程保活与画面恢复交给 `tmux`**：[会话文档](https://vibe42.ai/docs/how-it-works/sessions)说明，Vibe42 在宿主机上维护一套自己独立的 `tmux` 会话，不会去乱动你平时自己用的默认 `tmux`。手机切后台或者进电梯断网时，客户端直接断开连接，宿主机上的 Agent 继续在 `tmux` 里跑。**但如果宿主机本身重启了，情况就不同了**：原来的进程肯定会断掉，Vibe42 后台服务起来后会重新建好窗口、回放之前保存的屏幕输出，并重新拉起启动命令；像 Claude Code 这种支持恢复历史会话的 Agent 可以重新打开本地存盘的对话，但重启瞬间被打断的那一轮推理任务是不会自动接着跑的。
* **语义状态感知靠 `OSC 7501` 与包装引擎**：`tmux` 只认字符网格，它分不清屏幕上的字到底代表“Agent 正在埋头改代码”，还是“卡在 `[Y/n]` 等你批权限”。为了拿到这个语义状态，[Vibe42](https://vibe42.ai/docs/agents/osc-7501) 引入了公开的 **Program Status Protocol（`OSC 7501`）**（一串以 `\x1b]7501;...` 开头的不可见转义序列），并按 Agent 的支持程度分了三档处理：
  1. **原生直报**：已经接入该协议的 Agent（比如 Claude Code ≥ 2.1.295、Pi Coding Agent），直接在输出流里吐出 `OSC 7501` 状态帧，主动上报当前状态、进度和暂停原因。
  2. **混合补齐**：只上报一部分状态的工具（比如 OpenAI Codex CLI、OMP、Grok Build），由宿主机侧的包装引擎（Wrapper Engine）结合屏幕匹配规则和本地会话记录把状态拼完整。
  3. **引擎代报**：完全没接入协议的工具（比如 Gemini CLI、Cursor Agent、Devin CLI、GitHub Copilot CLI），全靠后台包装引擎盯着屏幕特征和本地会话记录，判断是不是到了“等待确认”或“任务结束”，再通过云端网关调起苹果 APNs 或谷歌 FCM 发锁屏推送。

### 5. 存储与工作区层：用文件系统的 CoW 做去重和隔离副本

同时跑多个 Agent 时，大家最常用的隔离方式是建好几个 Git Worktree，让每个 Agent 在自己的目录里改代码、跑编译。但如果写的是 Rust、C++ 这类编译型语言，一个工作区的 `target/` 目录动辄就是几十个 GB，开五六个 Worktree 很快就能把硬盘塞满。

在 [v0.13.1 版本](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)里，Vibe42 加进了工作区压缩去重和当时标为实验性的手动快照隔离（目前官网已经把[存储去重](https://vibe42.ai/docs/workspaces/storage-dedup)和[终端隔离](https://vibe42.ai/docs/workspaces/terminal-isolation)的使用文档分别放出）：

* **用户态直接调文件系统底层能力**：v0.13.1 发布说明提到，这套机制不需要 root 权限，也不依赖 FUSE。不过不同文件系统的本事并不一样，不能简单一刀切地理解成全都支持“CoW + 压缩”：macOS 的 APFS 支持内容去重加 `decmpfs / LZFSE` 压缩；Linux 的 btrfs 支持去重加 `zstd` 压缩；ZFS 需要依赖开启了 block cloning 的 OpenZFS，且压缩归 dataset 属性管；而 **XFS 只支持块去重，本身并不提供透明压缩**。
* **到底能省多少空间**：根据官方在 [VibeCafé 放出的 400GiB 级 Rust 项目实测数据](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)，单次扫描转换耗时约 76 分钟，处理了 176,904 个文件，把 206.4 GiB 的数据压到了 67.5 GiB（大约是原来的 33%），同时消掉了 65.74 GiB 的重复数据块，总共腾出超过 154 GiB 的可用空间（注：这是官方在单个 Rust 项目上的实测结果，实际能省多少得看具体项目的构建产物结构）。至于“终端隔离”，它的做法是给每个窗口建一份整个工作目录的 CoW 副本，同一个窗口里的分屏共用这份副本——这解决的是多个终端同时改文件时的互相覆盖问题，但它只是文件系统层面的副本隔离，不等于容器、进程权限或网络隔离。

## 三、 Vibe42 做得漂亮的地方（Pros）

1. **克制的“零侵入”设计，兼容性好**：它不去魔改或劫持 Agent 的交互协议，不代理你的大模型 API 请求，也不会往项目目录里塞一堆私有配置。直接透传终端省去了给每个新 CLI 重新写一套前端界面的麻烦；只要配合 Agent 原生上报或包装引擎，就能把状态推送补齐。
2. **自带 P2P 自动打洞，还有完整远程桌面兜底**：比起纯靠 WebSocket 转发、或者要求用户先自己搭好 Tailscale 的方案，它把 `边缘 AP 中转 + libp2p DCUtR 自动打洞` 做成了开箱即用的闭环。更实用的是，除了终端之外，它还内置了支持多显示器和 Linux X11/Wayland 的**完整远程桌面控制**（见 [Vibe42 v0.13.1 发布说明](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)）。万一遇到必须点一下 GUI 弹窗、过一下桌面端 OAuth 授权或者看一眼模拟器画面的情况，能直接切过去救场。
3. **顺应手机系统脾气的连接管理**：App 切后台就干脆地断开连接，让宿主机上的 Agent 自己跑，有事靠 APNs / FCM 推送唤醒，切回前台再秒重连。比起硬在手机后台挂着长连接保活的传统 SSH 客户端，这种做法更顺应 iOS / Android 的后台机制（具体省电幅度和重连耗时本文未做量化实测）。
4. **切中痛点的 CoW 存储去重**：针对 `Rust + Git Worktree` 多开把磁盘撑爆的老大难问题，直接调用 APFS / btrfs / XFS 的底层 CoW 能力做块共享去重和目录副本隔离，不用为了省磁盘再去套一层 Docker 容器或 FUSE（[Vibe42 v0.13.1 发布说明](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)）。

## 四、 Vibe42 的短板与工程妥协（Cons & Trade-offs）

1. **闭源商业收费，蜂窝网络下有中转流量额度压力**：
   跟开源免费的 [Paseo](https://github.com/getpaseo/paseo) 和 [Orca](https://github.com/stablyai/orca) 不同，Vibe42 走的是商业订阅制（核对时个人 Basic 套餐 $8/月、Pro 套餐 $25/月），套餐内包含每月的中转 Credits 额度。根据[官方计费文档](https://vibe42.ai/docs/account/credits-and-usage)，**64 MiB = 1 Credit**，而且 AP 的入站和出站是分开计量的——也就是说，经由 AP 中转转发 64 MiB 的应用数据，进 AP、出 AP 两段合计要扣 **2 Credits**。虽然**原生客户端打通 P2P 直连后不扣 Credits，但网页端固定走中转**；如果当月额度用光，中转数据连接就会被暂停。如果你常处的移动网络或公司内网是严格对称型 NAT，或者只开了 443 端口导致打洞失败，原生端也会长期走中转消耗额度。目前官方公开文档里也没有提供自建私有 AP 节点的方案。
2. **在手机竖屏上怼“原生终端 TUI”，操作依然局促**：
   GPU 渲染解决的是“画面流不流畅”，但改变不了手机屏幕小的物理限制。在几英寸的竖屏上看桌面宽度的终端字符网格、翻阅长篇代码 Diff 或者敲长串指令，总归不如专门为手机重绘的原生 GUI 顺手（比如 Paseo 专门针对手机做的对话流卡片、文件改动树和本地离线语音输入）。
3. **“第三档”屏幕状态识别容易受上游改版影响**：
   像 Gemini CLI、Cursor Agent 这类还没原生接入 `OSC 7501` 的工具，Vibe42 只能靠后台包装引擎去匹配屏幕文本模式和本地会话记录。一旦上游 CLI 某次更新改了 TUI 界面排版，在 Vibe42 官方跟进更新匹配规则之前，就可能出现推送漏报或误报。
4. **自动化编排偏底层 CLI，没有现成的高层协议控制面**：
   Vibe42 并不是只能手动分屏。它公开的 [`v42` CLI](https://vibe42.ai/docs/cli/overview) 已经支持创建和挂载终端、拉起 Agent、同步文件、转发端口、诊断网络以及管理隔离副本，而且支持 JSON 输出并提供了[自动化脚本示例](https://vibe42.ai/docs/cli/automation)，完全可以用脚本把跨机器、跨 Agent 的操作串起来。不过，跟 Paseo 直接内置 MCP Server、TypeScript SDK 和 Skills 交接命令相比，Vibe42 暴露的接口更接近“远程终端与工作区控制”，高层的多 Agent 协作流得靠你自己写脚本去搭。
5. **受制于单台物理宿主机与特定文件系统**：
   如果家里电脑休眠、断电或者编译爆内存卡死，远程也就彻底失联了。另外，v0.13.1 主打的存储去重依赖 APFS、ZFS、XFS 或 btrfs，如果你还在用传统的 Linux `ext4` 或者 Windows NTFS 分区，这部分红利是吃不到的。

## 五、 同赛道深度横评：Vibe42 vs. Paseo vs. Orca vs. 自建栈

在目前的远程与多 Agent 开发工具里，**[Paseo](https://paseo.sh/)** 和 **[Orca](https://github.com/stablyai/orca)** 是最适合拿来跟 [Vibe42](https://vibe42.ai/zh-HANS) 做对照的两个开源项目。尤其是 **Paseo**，它瞄准的使用场景跟 Vibe42 高度重合，但底层的解题思路几乎完全相反。

### 1. 正面交锋：Vibe42 vs. Paseo（原生终端透传 vs. 开源协议控制面）

[Paseo](https://paseo.sh/)（[getpaseo/paseo](https://github.com/getpaseo/paseo)）是一个采用 **Apache-2.0 协议完全开源**的跨平台 Agent 开发环境（覆盖 iOS、[Android](https://play.google.com/store/apps/details?id=sh.paseo)、桌面端、Web 与 CLI）。把这两个工具放在一起看，正好代表了两种截然不同的工程哲学：

* **交互层怎么抽象：Vibe42 传“原始终端画面”，Paseo 拆“结构化协议”**
  * **Vibe42** 把所有 Agent 都当成黑盒终端进程，用 `tmux + libghostty-vt` 把原原本本的终端画面搬到手机上，再靠 `OSC 7501` 从旁路提取运行状态。
  * **Paseo** 则采用了类似 Docker 的 `Client-Daemon` 架构（宿主机跑 `packages/server` 守护进程）。它给 Claude Code、Codex、OpenCode、Pi 等主流工具分别写了专门的 **Provider 适配器，并支持 ACP（Agent Client Protocol）**（见 [Paseo 官网](https://paseo.sh/)）。所以当你打开 Paseo 的原生手机 App（基于 Expo / React Native 构建）时，主界面不是黑底白字的终端，而是**结构化的对话流、清晰的 Diff 文件修改树、PR 状态、定时任务（Schedules）以及本地离线语音输入（On-device Voice）**（见 [Paseo App Store](https://apps.apple.com/us/app/paseo-remote-coding-agents/id6758887924)）。在手机小屏幕上审阅代码改动、动嘴发指令时，这种专门重绘的移动界面确实更顺手。
* **网络怎么连：Vibe42 省心在“自动 P2P 打洞”，Paseo 痛快在“全开源免费 + 可自建 Relay”**
  * **Vibe42** 的强项是内置了 [libp2p DCUtR](https://github.com/libp2p/py-libp2p/discussions/869) 自动打洞，不用装 Tailscale，也能尝试 P2P 直连，省掉中转 Credits；但如果所处网络打不通洞，走官方中转就得按量扣付费 Credits，目前公开文档也没有提供自建私有 AP 的方案。
  * **Paseo** 不去折腾复杂的 UDP NAT 打洞，而是直接给你三条明路：① 白嫖官方免费的端到端加密中转服务（`wss://relay.paseo.sh`）；② 直接绑你自己的 Tailscale IP、Cloudflare Tunnel 或 SSH 隧道（见 [Paseo Connectivity 文档](https://paseo.sh/docs/connectivity)）；③ **连中转服务器的源码都彻底开源了**（[getpaseo/paseo-relay](https://github.com/getpaseo/paseo-relay)，用 Elixir/OTP 与 Cowboy/Syn 编写），照着部署说明就能在自己的云服务器上跑一套私有 Relay（见 [Paseo 中文 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)）。
* **多 Agent 怎么协同：Paseo 给出了现成的控制面接口（MCP / SDK / Skills / 400+ 插件）**
  * **Vibe42** 提供的是持久化终端、隔离副本和 `v42` CLI，给你留好了写脚本做自动化的底子，但跨 Agent 的任务交接逻辑需要你自己去拼。
  * **Paseo** 的守护进程本身就是一个 **MCP Server**，同时配齐了 CLI（`paseo run` / `paseo attach` / `paseo send`）和 TypeScript SDK（[Paseo 中文 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)）。它原生支持通过 Skills 让不同 Agent 接力干活：比如敲个 `/paseo-handoff`，先让 Claude Opus 把架构方案定好，然后一键把上下文无缝交接给 Codex 动手写代码；或者敲 `/paseo-committee`，同时拉起两个不同模型的 Agent 一起会诊疑难 Bug（[Paseo 中文 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)）。官网还列出了 400+ 社区插件，甚至支持你在手机上直接跟 Agent 说一句“帮我在侧边栏加个待审 PR 面板”，Agent 就能当场写个本地插件并热加载进 Paseo 界面里，连重启都不用（[Paseo 官网](https://paseo.sh/)）。
* **系统底层能力：Vibe42 赢在“CoW 磁盘去重”与“完整远程桌面”**
  * **Paseo** 的工作区隔离走的是标准 `git worktree`（默认放在 `$PASEO_HOME/worktrees/` 下，见 [Paseo Worktrees 文档](https://paseo.sh/docs/worktrees)）。如果你开 5 个 Worktree 并行编译大型 Rust 项目，标准 Worktree 可不会帮你合并各个目录下新生成的构建产物（至于会不会撑爆硬盘，还得看项目大小和你的缓存清理策略）；而 **[Vibe42 v0.13.1](https://vibecafe.ai/item/cmvxs543j00oc08l5krlhi5nb)** 实打实地做进了 APFS / btrfs / XFS 的 CoW 块去重与快照隔离。
  * 另外，如果你在外面除了看终端和 Diff，偶尔还非得点一下宿主机桌面上的 GUI 软件（比如点开 iOS 模拟器、点一下浏览器里的登录授权弹窗），**Vibe42** 自带完整远程桌面，而 **Paseo** 目前的公开文档里还没有这类远程桌面功能。

### 2. 再看 Orca（`stablyai/orca`）：专为桌面端并行“赛马”打造的工作台

[Orca](https://github.com/stablyai/orca)（MIT 开源）虽然也支持连远程服务器（SSH Worktree）并提供了 iOS/Android 手机伴侣应用（见 [Orca 中文 README](https://github.com/stablyai/orca/blob/main/docs/readme/README.zh-CN.md)），但它的发力点跟 Vibe42、Paseo 明显不在一个维度上：

* **重心完全在桌面端（ADE 定位）**：Orca 最拿手的是桌面端的工作流整合——比如把同一个 Prompt 同时发给 5 个跑在独立 Git Worktree 里的不同 Agent“赛马”，写完直接对比挑最好的；内置了真正的 **Chromium 浏览器设计模式（Design Mode）**，用鼠标在页面上点一下按钮，就能把对应的 HTML、CSS 和裁剪截图直接塞进 Agent 提示词里；支持像审 GitHub PR 一样，在 AI 生成的 Diff 任意一行上写批注打回重改；还原生集成了 GitHub PR 和 Linear 看板（[Orca 中文 README](https://github.com/stablyai/orca/blob/main/docs/readme/README.zh-CN.md)）。
* **手机端只是“伴侣监控”，不是“独立主控”**：Orca 的手机 App（基于 React Native，通过 6768 端口的 WebSocket RPC 或 Orca Relay 跟桌面端通信，见 [orca/mobile 文档](https://github.com/stablyai/orca/blob/main/mobile/README.md)）主要是让你在离开电脑时看一眼进度、收个通知、补发两句指令。它本身就是围绕桌面端工作区设计的附属伴侣，如果你核心诉求是在手机上重度调度，选型前最好先试一下它的移动端边界。

### 3. 四大方案全景对比表

| 评估维度 | [Vibe42](https://vibe42.ai/zh-HANS) | [Paseo](https://paseo.sh/) ([getpaseo/paseo](https://github.com/getpaseo/paseo)) | [Orca](https://github.com/stablyai/orca) (`stablyai/orca`) | 自建栈（Tailscale + Termius + tmux） |
| :--- | :--- | :--- | :--- | :--- |
| **开源与商业模式** | **商业订阅**（个人月付 $8 / $25，含中转 Credits 额度） | **开源免费**（Apache-2.0，含客户端、Daemon；Relay 也可自建） | **开源免费**（MIT 协议，主仓库公开） | **丰俭由人**（需另算客户端订阅、服务器与维护精力） |
| **核心交互方式** | **原生终端 TUI 透传**（Ghostty，随屏幕刷新率渲染）+ 远程桌面 | **结构化 Agent 控制面**（原生对话流、Diff 树、语音、终端一体） | **桌面重型多 Agent 工作台**（分屏赛马、Chromium 点选、行级批注） | **纯传统 SSH 终端**（无任何 AI 状态感知） |
| **远程网络方案** | 官方边缘 AP 中转 + **libp2p DCUtR 自动打洞直连** | 官方免费加密 Relay / **可自建私有 Relay** / 原生支持 Tailscale & SSH | 桌面端 WebSocket RPC + Orca Cloud Relay / 远程 SSH Worktree | 自己动手配 Tailscale / WireGuard 虚拟局域网 |
| **多 Agent 协同能力** | 持久化终端、隔离副本与 `v42` CLI；靠自写脚本编排 | 内置 MCP Server、CLI/SDK、Skills 任务交接与插件 API | 单 Prompt 多 Worktree 赛马对比、CLI 自动化 | 靠自己写脚本拼凑，自己维护 |
| **工作区与磁盘隔离** | **CoW 块去重与工作副本隔离**（压缩能力视文件系统而定） | 标准 `git worktree` 目录隔离 + 生命周期 Hook（无底层块去重） | 标准本地/SSH `git worktree` 隔离（无底层块去重） | 手动或写脚本管 Worktree、编译缓存与目录 |
| **移动端与特色本领** | 高刷原生终端、`OSC 7501` 状态推送、**自带完整 GUI 远程桌面** | 全功能原生移动 App、**本地离线语音输入**、热加载改自身 UI | 手机 Companion 伴侣盯进度、桌面端 **Chromium 点选页面截图** | 手机 SSH 硬敲命令，切后台易断，无原生 AI 推送 |
| **私有化部署能力** | 依赖官方控制面与 AP；推送通知标题正文经过服务端 | **Daemon 与 Relay 均可完全私有化部署**（模型请求仍走所选 Agent） | 本地优先（带可关闭的匿名遥测），远程支持纯 SSH 接入 | **可自建组网组件**（如 Headscale / DERP，需自己运维） |

## 六、 总结：放进实际工作流里，到底怎么选？

一圈拆下来可以看到，这四个方案根本不存在“谁全方位吊打谁”，它们各自押注了不同的工程取舍：

1. **大多数想在手机/平板上远程管 Agent 的人，建议先试 [Paseo](https://paseo.sh/)**
   如果你的核心诉求是在手机、平板和电脑之间无缝切换，随时看一眼 Claude Code、Codex 或 OpenCode 的进度，**可以先试 Paseo**。它不仅 Apache-2.0 完全开源免费（连 Elixir 写的加密中转服务器都能自己部署），更重要的是它没把思路局限在“把黑底白字的电脑终端缩放到手机屏幕上”，而是老老实实针对手机屏幕重做了 Diff 代码审查树、本地离线语音输入，还用 MCP 和 `/paseo-handoff` 把跨 Agent 接力干活做成了现成命令。如果你看重手机端看 Diff 的舒服程度、语音下指令、多 Agent 交接或者私有化 Relay，它就比较对路子（当然，开源免费指的是工具本身，你自己的大模型订阅和服务器开销另算）。
2. **主力坐在电脑前并发跑任务、改前端的人，看 [Orca](https://github.com/stablyai/orca)**
   如果你平时绝大部分时间还是坐在电脑前干活，想要一个能“一条 Prompt 同时发给 5 个 Agent 赛马、在内置浏览器里直接点选页面 DOM 元素喂给 AI、像审 PR 一样逐行批注打回 AI 代码”的**重型桌面工作台**，手机端只是下楼买咖啡时瞄一眼进度，那 Orca 的桌面工作流会非常对胃口，尤其适合经常要边看前端界面边改代码的同学。
3. **那月付 $8~$25 的 [Vibe42](https://vibe42.ai/zh-HANS) 到底适合谁买单？**
   跟免费开源的 Paseo、Orca 相比，Vibe42 真正护城河在于**对原生终端的死磕、P2P 连接管理、远程桌面，以及深入到文件系统的去重能力**。如果你经常碰到下面这些情况，它的订阅就值得考虑：
   * **你是纯正的终端重度用户**：不喜欢任何工具把 Claude Code 或 Neovim 的原生 TUI 界面改造成聊天框，就想在手机或 iPad 上继续用原汁原味的 Ghostty 终端和持久化 `tmux` 会话；
   * **你在用 Rust / C++ 等写大型编译项目，且重度多开 Worktree**：同时开五六个 Git Worktree 真的会把 Mac 硬盘撑爆，Vibe42 的 CoW 去重和隔离副本就是冲着这个问题来的；APFS / btrfs 还支持压缩，官方 Rust 案例省下过上百 GB，具体到你的项目能省多少还要实测；
   * **你偶尔必须用到完整的 GUI 远程桌面**：除了命令行 Agent，出门在外还得时不时点一下电脑桌面上的其他软件或模拟器，而且不想自己折腾内网穿透，希望开箱就有 `libp2p` 自动打洞。
   不过掏钱之前，建议先在你平时最常待的网络（比如公司 Wi-Fi 和手机 5G）下测一下它的 P2P 直连成功率，算算网页端和远程桌面会不会很快把每月的中转 Credits 烧光。
4. **至于自己攒 `Tailscale + SSH + tmux`**：
   适合家里本来就有 Homelab 组网基础、平时很少在手机上重度审代码，只是偶尔连回家敲两行命令看一眼的极客。既然现成工具都在手边，直接复用就行；只是优质 SSH 客户端的买断/订阅费、自建中转服务器和自己维护推送脚本的精力，得自己算进隐性成本里。

## 资料与核验说明

下面是文中各项技术细节和数字的出处。软件功能、定价与支持列表会随版本迭代变动，以下信息均以 2026 年 11 月 4 日核对时的公开页面为准：

| 核对项 | 依据与结论边界 |
| :--- | :--- |
| 三通道与连接回退 | [Vibe42 连接文档](https://vibe42.ai/docs/how-it-works/connections)：`control`、`terminal`、`file` 为三条独立连接，可各自独立处于直连或中转状态。 |
| 配对与吊销时效 | [安全模型](https://vibe42.ai/docs/how-it-works/security)：配对码 10 分钟有效、单次使用；注销后 60 秒内断开活动连接（文档标称值，未做独立实测）。 |
| 网页中转与流量计费 | [Credits 文档](https://vibe42.ai/docs/account/credits-and-usage)：网页端固定走中转，64 MiB = 1 Credit，AP 入站与出站分别计费（即转发 64 MiB 计 2 Credits）。 |
| Ghostty 与各端渲染 | [终端引擎](https://vibe42.ai/docs/terminal/engine)：Metal、wgpu、TextureView、WebGL / Canvas 2D。TextureView 为 Android 视图组件，120Hz 为高刷新率支持能力。 |
| Agent 状态适配分级 | [支持列表](https://vibe42.ai/docs/agents/supported-agents)、[OSC 7501 规范](https://vibe42.ai/docs/agents/osc-7501)：分原生直报、混合补齐与引擎代报三档；包装引擎需通过 Vibe42 启动流程或 `v42 term new --agent` 接入。 |
| 推送通知的数据边界 | [通知链路](https://vibe42.ai/docs/agents/notifications)：通知标题和正文对 Vibe42 服务端及推送通道可读，与终端、文件的 E2EE 通道边界不同。 |
| CoW 去重与隔离副本 | [去重支持矩阵](https://vibe42.ai/docs/workspaces/storage-dedup)、[隔离副本](https://vibe42.ai/docs/workspaces/terminal-isolation)：XFS 仅支持去重无透明压缩；目录 CoW 副本隔离不等同于容器、进程权限或网络隔离。 |
| Vibe42 CLI 自动化 | [CLI 概览](https://vibe42.ai/docs/cli/overview)、[自动化示例](https://vibe42.ai/docs/cli/automation)：提供 JSON-first 的 `v42` CLI，支持脚本化控制终端与工作区。 |
| Paseo 架构与扩展 | [项目 README](https://github.com/getpaseo/paseo/blob/main/README.zh-CN.md)、[连接文档](https://paseo.sh/docs/connectivity)、[Worktree 文档](https://paseo.sh/docs/worktrees)。 |
| Orca 定位与移动端 | [项目 README](https://github.com/stablyai/orca/blob/main/docs/readme/README.zh-CN.md)、[Mobile README](https://github.com/stablyai/orca/blob/main/mobile/README.md)。 |
