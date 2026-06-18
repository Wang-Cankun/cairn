# Cairn

[English](README.md) | **中文**

[![release](https://img.shields.io/github/v/release/Wang-Cankun/cairn?sort=semver)](https://github.com/Wang-Cankun/cairn/releases) ![bun](https://img.shields.io/badge/bun-%E2%89%A51.3-black)

> 一个面向 AI 驱动分析的**确定性抗洗白底座（deterministic anti-laundering substrate）**。Cairn 把 agent 得出的结论记录成带版本的 **claim**，每条都携带它的证据、条件、矛盾与新鲜度（freshness）——并强制一致性，却从不替你解释、打分或下判断。

**Cairn（玛尼堆）** 是早先的行路人垒在小径上的一摞石头，好让后来者认得路。Cairn 为分析做同一件事：你的下一个 AI session——或一位协作者——继承到的是一份诚实、扎根于证据的记录，而不必从头重推，也不必轻信一个被打磨光鲜的结论。

## 为什么

一个结论很少以干净事实的样子出现。它条件于你恰好走的那一条分析路径——也许还被另一条你没报告的路径反驳过；它依赖的数据可能早已改变；可能没有任何人拿真实世界检验过它。当它沿着 产物 → claim → 摘要 → 结果 这条链向上、跨越不同 agent 与数月时间时，这些限定条件悄悄脱落，一个本来试探性的发现最终看起来确凿无疑。这就是**洗白（laundering）**。

Cairn 唯一的工作就是阻止它。它**不做任何解释**——从不数路径、不平均效应、不给你一个判决。判断留在你（或你的 agent）手里；工具只记录你声明的内容，并强制它能确定性核验的那部分。完整论证见 **[白皮书](docs/WHITEBOOK.md)**（[PDF](https://github.com/Wang-Cankun/cairn/releases/latest)）。

## 它解决什么

结论在变成一份正式发现的路上，有六种被扭曲的方式——以及 Cairn 对每一种的应对：

| 陷阱 | Cairn 的应对 |
|---|---|
| **歧路花园（forking paths）**——同一份数据支持多条合理的分析，而你悄悄选了一条 | 每条 claim 都记录它所条件于的那条分叉（`depends_on_fork`） |
| **拿苹果比橙子**——只有回答**同一个问题**的结果才可比 | 先声明 `estimand`；CLI 拒绝合并不共享同一 estimand 的 claim |
| **丢失的 caveat**——一个无法消除的混杂死在脚注里，永远到不了读者面前 | confound 是一等节点，被每条下游 claim 继承 |
| **被掩埋的矛盾**——一个被反驳的结果悄悄"关闭"为已了结 | 矛盾会持久存在；有争议的 claim 永远不能被标记为 settled |
| **重推导**——一个新 session 重新犯下一个早已被反驳的错误 | 判断被持久捕获并继承，而非从零重推 |
| **囤积的不确定性**——只标出疑问，却从不给一个出口 | 每条残余都带一条 *deflation route*：究竟靠什么才能把它缩小 |

## 安装

```sh
bun install   # bun ≥ 1.3 —— 不用 npm / node
```

CLI 会从当前目录向上查找（或自动创建）一个 `cairn/` store。用 `bun run cairn <verb>` 调用。

## agent 循环

Cairn 由一个 AI agent 通过四个触点驱动（即 [skill](skill/cairn/SKILL.md)）：

| 步骤 | 动词 | |
|---|---|---|
| **Orient（定向）** | `cairn head` | 动手前，先读 canonical claim、实时 freshness、未解决的矛盾 |
| **Author（记录）** | `cairn add-claim --text "…" --evidence kind:ref` | 记下一个结论，连同它的 estimand、证据、所依赖的分叉，以及它矛盾于什么 |
| **Refresh（刷新）** | `cairn refresh` | 重新给产物打指纹；浮出新近变 stale 的 claim |
| **Publish（发布）** | `cairn validate` → `cairn publish` | 过闸，然后冻结一个不可变的 OKF bundle |

完整动词集：`head · add-claim · add-estimand · add-confound · review · refresh · validate · publish · drafts · status · reconcile · migrate`。

## 工作原理

- **不做解释**——CLI 只做打指纹、校验图结构、过闸；它从不计数、平均、打分或下判决。判断属于 agent。（[ADR 0004](docs/adr/0004-no-interpretation-deterministic-substrate.md)）
- **`canonical ≠ verified`**——成为"当前共识记录"不等于"为真"。agent 永远不能设 `verified`；只有来自分析体系之外的确认（一次湿实验结果、一支独立队列）才能。（[ADR 0006](docs/adr/0006-verification-territory-locked-corroboration.md)）
- **freshness 由指纹派生**，而非由过程决定——`fresh` / `stale` / `unknown`，其中 `unknown` 是一个诚实的状态，不是失败。（[ADR 0002](docs/adr/0002-freshness-by-evidence-fingerprint.md)）
- **[OKF](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/) 原生**——claim、estimand、confound 都是 markdown + frontmatter 文件；字节按引用保存；发布出的 snapshot 是可移植的 OKF bundle。
- **诚实的天花板**——Cairn 强制的是"与你声明的内容一致"，而非"声明为真"。它拦不住你误声明；它让记录变得诚实，而非正确。

## 文档

- **[白皮书](docs/WHITEBOOK.md)**——正典的*为什么 + 是什么*（PDF 见[最新 release](https://github.com/Wang-Cankun/cairn/releases/latest)）。
- **[CONTEXT.md](CONTEXT.md)**——术语表与当前决定（权威）。
- **[docs/adr/](docs/adr/)**——已解决的设计分岔，ADR 0001–0006。

## 开发

```sh
bun test            # 单元测试 + CLI 集成测试
bun run acceptance  # 针对 fixtures 的端到端流程
```
