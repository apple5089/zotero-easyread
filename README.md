# Zotero → EasyRead

[English](README.en.md) · [EasyRead 原项目](https://github.com/Edwardxlai/easyread)

在 Zotero 管理论文，用 EasyRead 阅读。右键发送 PDF，复用已有译文和阅读记录，再把阅读笔记手动同步回 Zotero。

这是独立的社区集成项目。感谢 [@Edwardxlai](https://github.com/Edwardxlai) 开发 EasyRead；本项目未获得 EasyRead 官方维护或背书。

## 功能

- 右键“用 EasyRead 阅读”：首次导入；同一 PDF 按完整 SHA-256 去重。
- 多选“发送到 EasyRead（批量，先不翻译）”：每批最多 20 篇。
- 右键“同步 EasyRead 阅读笔记”：整篇心得、划线、批注、问题、原 PDF 页序号、段落英文和保存到页边的 AI 回答，写入文献的专属子笔记。
- 同步内容不变时复用笔记。在 Zotero 手动编辑专属笔记后，保留该版本并创建新的受管理版本。
- “返回 EasyRead”链接可打开同一 PDF；EasyRead 1.3.1+ 直接使用官方桌面入口定位段落，无需桌面补丁。
- 自动发现本机服务端口，无需固定端口或云端中转。

同步是 **手动、单向 EasyRead → Zotero**。不创建 Zotero PDF 原文高亮，不合并两边任意修改，不同步完整 AI 聊天记录。翻译与问答沿用 EasyRead 中配置的模型及其费用规则。

## 安装

已做真实软件测试的环境为 **Windows、Zotero 10.0.5-beta.2、EasyRead 1.3.0 与 1.3.2**。其他 Zotero 8–10 版本和其他平台尚未完成真实集成测试，不能保证兼容。

1. 从本仓库 [Releases](https://github.com/apple5089/zotero-easyread/releases) 下载最新 XPI。
2. Zotero → 工具 → 插件 → 齿轮菜单 → 从文件安装插件，选择 XPI。
3. 启动 EasyRead。Zotero → 工具 → EasyRead：连接设置，填写 EasyRead 可执行文件路径；插件会依次检查已设置的目录、安装目录下的 `data` 和用户目录下的 `EasyRead`。
4. 右键文献或已下载的 PDF 附件 → **Zotero → EasyRead** 子菜单 → 用 EasyRead 阅读。
5. 阅读后在同一条目上执行“同步 EasyRead 阅读笔记”。

首次单篇导入默认请求翻译，可在连接设置中关闭。批量发送始终不自动翻译。EasyRead 1.3.1+ 通过官方入口直接在桌面打开；旧版未安装桌面桥时在本机浏览器打开阅读页。

PDF 必须已下载到本机，最大 200 MB。文献包含多个 PDF 时默认使用 Zotero 首选 PDF，也可明确选中某个附件。独立 PDF 需关联文献后才能回写子笔记；只读文献库无法回写。

## 仅旧版可选：EasyRead 1.3.0 桌面桥

EasyRead 1.3.1+ 使用官方 `easyread://open` 协议，**不用执行下面的补丁操作**。新版 API 约定见 [EasyRead docs/api.md](https://github.com/Edwardxlai/easyread/blob/main/docs/api.md)。

桌面桥给本机安装的 EasyRead 增加一个小模块，以本地文件传递跳转请求。补丁工具只接受已识别的 Electron 主程序结构，保存原程序备份。**EasyRead 更新后可能覆盖补丁**；届时浏览器阅读仍可使用。

需要 Python 3.10+ 和 PowerShell 7+。从源码或 ZIP 解压后，正常关闭 EasyRead，执行：

```powershell
python desktop/patch_asar.py --source "C:\Program Files\EasyRead\resources\app.asar"
pwsh -File install.ps1 -EasyReadDir "C:\Program Files\EasyRead"
```

路径请按实际安装位置修改。若系统权限要求，以管理员身份运行桌面安装脚本。脚本只安装桌面桥，不复制、启用其他 Zotero 插件，不关闭或升级任何软件。

撤回桌面补丁：正常关闭 EasyRead，再运行 `pwsh -File restore.ps1`。Zotero 插件可在插件管理页单独卸载。恢复不删除阅读缓存或笔记。

## 开发与测试

无需 npm / pip 第三方依赖；Node.js 22+、Python 3.10+ 即可：

```bash
node --test tests/core.test.cjs tests/compat.test.cjs
python -m unittest discover -s tests -p "test_*.py" -v
python build.py
```

构建输出为 XPI 和仅包含集成源码的 ZIP，不分发 EasyRead 程序。GitHub Actions 在 Windows、macOS、Linux 运行核心单元测试；这不代表三个平台都通过了真实软件集成测试。真实测试流程见 [VALIDATION.md](VALIDATION.md)。

## 数据与兼容

关联记录保存在 Zotero 配置目录的 `zotero-easyread.json`；启动状态在 `zotero-easyread-status.json`。桌面跳转状态在 EasyRead 数据目录的 `zotero-bridge/`。请勿公开这些运行数据或模型配置。

当前使用 EasyRead 文档中的 API v1、PDF 指纹和阅读数据结构，以及 Zotero MenuManager。旧版保留 API 与桌面桥兼容路径。PDF 内容替换后会关联新版本，保留旧版本笔记；未知 API 版本会明确提示更新插件。

## 许可证与贡献

集成代码使用 [MIT](LICENSE)。EasyRead 及其他依赖的归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。欢迎反馈问题或提交聚焦单一变更的 PR，见 [CONTRIBUTING.md](CONTRIBUTING.md)。
