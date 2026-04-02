<div align="center">

# Super SPC

**一个完全开源的现代 statistical process control 平台**


[快速开始](#快速开始) &bull; [功能特性](#功能特性) &bull; [图表类型](#图表类型) &bull; [为什么是-super-spc](#为什么是-super-spc) &bull; [架构](#架构)

---

![Super SPC Workspace - 深色 command-center 风格界面，包含带 zone shading 的 control chart、recipe rail 和 evidence panel](docs/assets/multi-chart.png)

</div>

## 为什么建立这个项目

很多产品，比如 **JMP/Minitab** 确实是 **6 sigma** 领域的权威工具，但是它们：

- 很难定制化开发需求；
- 系统迭代慢，流程僵化；
- 生态过于封闭，核心算法代码闭源，上手难度大；
- 对 AI/ML 适配性较弱；

更重要的是：它们太贵！如果你的日常工作只需要关注 SPC，那你可能需要为 90% 你根本用不到的其它功能付费。

况且这些工具的 spc 功能并没有多么 fascinating，大多数经典的算法/工作流即便是自己使用 python 也能实现。

Thanks to AI，现在每个人都可以快速写出自己的产品，**super-spc** 就是这么诞生的。它从许多经典数据可视化/质量管理工具中得到灵感，并结合了现代交互/架构设计。

许多功能尚不完善，还需要集成现代的 PHM/APC 中的 AI/ML 技术。但得益于 ai coding，产品迭代速度可以非常快，欢迎 process engineer，reliability engineer 或任何对这个项目有兴趣的人提出优化建议。



## 功能特性

### Chart is the Hero

- 最大化 chart 的可交互性，可 marquee select points，可 pan/zoom axis，phase 区域可选中
- 右侧 rich evidence rail，展示选中点信息以及 method info
- 可配置的 forcast area，即时预测 series 走向 (开发中)

![在 IMR chart 上用彩色圆环标出 rule violations](docs/assets/hero.gif)



### Multi-Chart Workspace

- 多图排列，拖拽重排
- 自适应 scale

![multi-chart-demo](docs/assets/multi-chart-arange.gif)

<table>
<tr>
<td width="50%">

**24 种 chart types**，覆盖常见 SPC 场景：
- Shewhart variables 与 attributes
- CUSUM（tabular + V-mask）
- 带 residuals 与 forecast 的 EWMA
- Hotelling T² 与 MEWMA
- short-run、rare event、Laney P'/U'
- 带 runs test 的 run chart

</td>
<td width="50%">

**Multi-chart workspace** 支持拖拽布局：
- chart 彼此独立，不强制配对
- 每个 chart 都有自己的 accent color（8 色循环）
- 自适应布局，padding 和字体随 pane 大小变化
- 保证 plot area 的可用垂直空间
- 可以直接拖拽 axis 做 pan / scale，交互风格接近 JMP

</td>
</tr>
</table>


### Data Prep：减少 round-trip

客户端 data engine 基于 [Arquero](https://uwdata.github.io/arquero/)。

| Phase 1（Row Ops） | Phase 2（Column Ops） | Phase 3（Validation） |
|---|---|---|
| Filter（11 种 operator） | Rename | Range validation |
| Find & Replace（regex） | Change type | Allowed values |
| Remove duplicates | Calculated columns | Regex patterns |
| Missing values（7 种策略） | Recode values | Column profiling |
| Trim & clean | Bin / Split / Concat | Normality assessment |
| Sort（multi-column） |  | Outlier detection |
| Column reorder & hide |  |  |

列头会直接显示 **inline histogram**、**completeness bar** 和 **summary stats**。点击任意列，可以查看完整 statistical profile，包括 quantiles、moments、outlier counts 与 normality assessment。

![Data Prep - 三栏布局，包含 dataset list、transform toolbar 和 data table](docs/assets/data-prep.png)

![Column profiling - 分布 histogram、quantiles 与 normality assessment](docs/assets/column-profile.png)


### Findings

深入每个 chart 的 control 信息，结构化输出 insights

![Findings](docs/assets/findings.gif)


### Method Lab

比较不同 chart 之间的检测差异

![Method lab](docs/assets/method-lab.gif)


### Keyboard-First

| Key | Action |
|---|---|
| `←` `→` | 在数据点之间导航 |
| `n` / `p` | 跳转到下一个 / 上一个 violation |
| `?` | 显示快捷键 |
| `R` `T` `C` `F` `D` `Z` | Data prep 操作 |

## 图表类型

### Shewhart Variables（10）
`XBar-R` &bull; `XBar-S` &bull; `IMR` &bull; `R` &bull; `S` &bull; `MR` &bull; `Run Chart` &bull; `Levey-Jennings` &bull; `Presummarize` &bull; `Three-Way`

### Shewhart Attributes（6）
`P` &bull; `NP` &bull; `C` &bull; `U` &bull; `Laney P'` &bull; `Laney U'`

### Short Run（4）
`Difference` &bull; `Z` &bull; `MR` &bull; `XBar variants`

### Rare Event（2）
`G chart` &bull; `T chart`

### Advanced Platforms（5）
`CUSUM Tabular` &bull; `CUSUM V-Mask` &bull; `EWMA` &bull; `Hotelling T²` &bull; `MEWMA`

**总计 27 种 chart types**，全部支持 zone shading、8 条 Nelson rules、6 条 Westgard rules 和 per-phase limit support。



## 架构

```text
Frontend (Vite)
- Vanilla JS + D3.js + morphdom
- Arquero（client-side data transforms）
- PapaParse（CSV parsing）

REST API

Backend (FastAPI)
- SQLite（WAL mode）
- async SQLAlchemy

Python imports

algo/（Pure Python）
- 24 chart types + 8 Nelson rules
- 6 Westgard rules + 7 sigma methods
- CUSUM ARL profiler + capability
- numpy + scipy + attrs
- pytest + hypothesis
```



## 快速开始

### 前置要求

- **Node.js** 18+
- **Python** 3.10+
- 一份包含 process data 的 CSV 文件

### Quick Start

```bash
# Clone repository
git clone https://github.com/dongyibing4real/super-spc.git
cd super-spc

# 安装前端依赖
npm install

# 安装后端依赖
cd api
pip install -r requirements.txt
cd ..

# 启动 backend
cd api
uvicorn main:app --reload --port 8000

# 新开一个终端，启动 frontend
npm run dev -- --port 4173
```

打开 **http://localhost:4173**，就能看到 app 页面。

采用了 vite/fastapi 架构，适合中小团队协作

## Contributing

欢迎贡献代码。提交 UI 相关变更之前，建议先阅读 `.claude/design/` 下的 design system 文档。

```bash
# 运行 algo test suite
cd algo
pytest -x --tb=short

# 运行 property-based tests
pytest --hypothesis-show-statistics
```

## License

本项目采用 `AGPL-3.0` license，详见 [LICENSE](LICENSE)。

---

<div align="center">

[报告 Bug](https://github.com/dongyibing4real/super-spc/issues)

</div>
