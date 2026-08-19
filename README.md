# Ghost · 幽灵看盘

Ghost 是一款极简、透明、无边框的 A 股桌面看盘工具。悬浮层只显示股票名称和涨跌幅，可随时用全局快捷键隐藏，适合需要低干扰查看行情的场景。

## 功能

- 透明、无边框、始终置顶，不显示任务栏窗口
- 自选股新增、删除，支持沪深京 6 位代码自动识别
- 默认使用 Tushare SDK `realtime_quote` 实时快照，盘中每 5 秒刷新一次
- 可选切换到付费 `rt_k` 实时日线接口
- 上涨、下跌、平盘颜色独立设置
- 字号和透明度可调
- 全局快速隐藏快捷键可自定义，默认 `Ctrl/Cmd + Shift + G`
- 可选鼠标穿透；设置始终可从系统托盘重新打开
- Token 只保存在当前电脑的 Electron 用户数据目录，不写入项目或云端
- Windows、macOS、Linux 安装包由 GitHub Actions 自动构建

## 安装

进入仓库的 **Actions → Build desktop apps → 最新成功任务 → Artifacts**，下载对应系统：

- Windows：`Ghost-Windows`，解压后运行 `.exe` 安装程序
- macOS：`Ghost-macOS`，解压后打开 `.dmg`
- Linux：`Ghost-Linux`，解压后运行 `.AppImage`

首次运行后，从系统托盘 Ghost 图标打开“设置”，填写 Tushare Token，保持推荐的 `realtime_quote` 模式并点击“测试”。

> 默认的 `realtime_quote` 对应 Tushare Python SDK 1.4.29 的实时快照模式：使用 Tushare Token 验证 SDK 权限，并从其默认新浪实时源批量读取快照，不需要购买 `rt_k` 权限。`rt_k` 仍是单独授权的付费“实时日线”接口。请以 [Tushare 实时日线文档](https://tushare.pro/document/2?doc_id=372)、[最新权限表](https://tushare.pro/document/1?doc_id=290) 和 [Tushare PyPI 最新版本](https://pypi.org/project/tushare/) 为准。

## 使用

1. 托盘菜单选择“设置”。
2. 输入 Token，选择 `realtime_quote` 并测试连接；已经购买实时日线权限时也可选择 `rt_k`。
3. 输入 `600519`、`000001.SZ` 等代码添加自选股。
4. 调整颜色、字号、透明度和快捷键。
5. 保存后只保留“股票名称 + 涨跌幅”。拖动文字区域可移动位置。
6. 按快捷键快速隐藏/显示；若开启鼠标穿透，从托盘菜单关闭。

为减少无效请求，程序仅在北京时间工作日的 A 股盘中区间自动轮询，启动、保存配置或手动刷新时会额外请求一次。法定休市日可能仍按工作日轮询，后续版本可接入交易日历缓存进一步优化。

## 本地开发

需要 Node.js 22：

```bash
npm ci
npm test
npm start
```

构建 Windows 安装包：

```bash
npm run dist:win
```

## 数据说明

涨跌幅由实时快照的最新价与昨收价计算：

`涨跌幅 = (最新价 - 昨收价) / 昨收价 × 100%`

本项目仅用于个人学习和研究。使用前请确认符合 Tushare 服务协议与数据授权范围，不应将行情视为交易建议。
