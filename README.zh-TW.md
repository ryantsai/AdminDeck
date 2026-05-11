<p align="center">
  <img src="src-tauri/icons/logo.png" alt="KKTerm" width="128" />
</p>

<h1 align="center">KKTerm</h1>

<p align="center">
  <em>你的終端機打來說——它們想要自己的作業系統。</em>
</p>

<p align="center">
  <a href="https://github.com/ryantsai/KKTerm/stargazers">
    <img src="https://img.shields.io/github/stars/ryantsai/KKTerm?style=social" alt="GitHub stars" />
  </a>
  <a href="https://github.com/ryantsai/KKTerm/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ryantsai/KKTerm" alt="MIT License" />
  </a>
  <br />
  <sub><a href="README.md">English</a></sub>
</p>

---

**KKTerm** 是一個<kbd>本地優先</kbd>、<kbd>Windows 優先</kbd>的桌面工作台，將終端機 session、SSH 主機、SFTP 傳輸、遠端桌面以及需人工審批的 AI 指令輔助整合在一個快速、原生的 Tauri v2 應用中。沒有雲端、沒有遙測、沒有 Electron。

想像一下：終端模擬器、連線管理工具、檔案瀏覽器和 AI 助手走進一間酒吧，然後決定不要再當四個獨立的應用程式——這就是 KKTerm。

## 設計理念

我們有一些堅持。以下依執著程度由輕到重排列：

### 1. 真正的本地優先

你的連線、設定和機密都存在你自己的機器上。SQLite 儲存持久化資料，作業系統鑰匙圈保管你的密碼和 API 金鑰。沒有雲端後端、沒有帳號、沒有那個「匿名收集你的 `~/.ssh/config` 以改進產品」的同步服務。完全離線可用。唯一會離開你機器的事情，就是你親手貼進遠端 shell 的那道指令。

### 2. 速度本身就是一個功能

如果你的終端應用冷啟動的時間，比你後悔打開它的時間還長——那這個終端應用就是錯的。KKTerm 在現代 Windows 硬體上不到一秒就能啟動。Rust 後端扛起效能重擔，Tauri v2 保持 runtime 精簡。我們為此做基準測試，也絕不為在乎啟動速度而道歉。

### 3. Windows 得到真正的關愛

KKTerm 是設計上就以 Windows 為優先，不是順便支援。這代表原生的 ConPTY 給本機 shell、Microsoft RDP ActiveX 給遠端桌面、WebView2 給嵌入瀏覽器畫面。macOS 和 Linux 是一級架構目標——只是它們還不是我們半夜兩點 debug 時會對著吼的那個平台。（暫時。）

### 4. AI 草擬、你來拍板、絕不例外

AI 助手可以建議指令、撰寫腳本、草擬設定。但它絕對不能在你明確批准之前執行任何東西。沒有自動套用、沒有沉默的副駕駛。如果 AI 想執行 `rm -rf /`，它得先說服你——而我們設計的 UI 確保這段對話是清晰可見的，不是藏在三點選單後面。

### 5. 高密度，不高干擾

淺色外框、深色終端。沒有新手引導精靈、沒有「最新消息」彈窗、沒有像迷路小狗一樣追著你滑鼠跑的工具提示。介面會自動退到幕後。分割窗格、分頁工作區、可折疊的連線樹——讓你需要密度時有密度，不需要時留白。

### 6. 一個工具，不是工具箱型錄

本機終端、SSH、SFTP、RDP、VNC、URL 網頁視圖、AI 面板——全都住在同一個視窗裡，而不是散落在工作列上的六個不同應用程式圖示之間。如果你需要 Alt+Tab 三次才能從 SSH 切到 SFTP——那你用錯工具了。

### 7. MIT 授權，因為半夜三點還要處理 copyleft 不是我們想面對的劇情

所有 runtime 依賴都是 MIT、Apache 2.0、BSD 或 MPL 相容的授權。核心不含 GPL。fork 它、打包它、嵌入它——授權不會是你做不到的理由。

---

## 功能模組

| 模組 | 狀態 | 說明 |
|------|------|------|
| **終端機** | 穩定 | 本機 shell（PowerShell、CMD、WSL）、SSH 及 tmux 回復、xterm 相容渲染、分割窗格 |
| **SFTP** | 穩定 | 雙欄檔案瀏覽器、拖放傳輸、chmod/chown、覆蓋提示、傳輸佇列 |
| **RDP** | Beta | Windows 原生遠端桌面，透過 ActiveX、DOM 覆蓋層暫存/截圖 |
| **VNC** | Beta | Rust 原生 VNC 客戶端，渲染至工作區畫布 |
| **AI 助手** | 開發中 | 審批式指令草擬、OpenAI 相容提供者、session 範圍上下文 |
| **連線管理** | 穩定 | SQLite 支援的樹狀結構，含資料夾、搜尋、拖放排序、快速連線、SSH config 匯入 |
| **儀表板** | 成長中 | 小工具遊樂場、應用啟動器、hash 計算機、IP 子網路工具 |
| **檔案總管** | 初期 | 原生速度的本機檔案瀏覽器替代方案 |
| **URL 網頁檢視** | 穩定 | 每個連線獨立的嵌入式 http(s) 畫面 |

---

## 快速開始

```bash
npm install          # 安裝前端依賴
npm run tauri dev    # 啟動桌面應用
npm run check        # 全面型別檢查
```

```bash
npm run package:portable   # 打包可攜式 ZIP
npm run package:installer  # 打包 NSIS 安裝程式
```

兩者都會輸出到 `artifacts/`，並附上 SHA-256 校驗檔。

---

## 技術棧

Rust (Tauri v2) · React 19 · TypeScript · Vite · Tailwind · Zustand · xterm.js · SQLite · OS keychain

---

<p align="center">
  <strong>如果 KKTerm 讓你少開一個 PuTTY 視窗，考慮給個 ⭐ 吧</strong><br />
  <sub>星星是免費的。看著星星計數器跳動的多巴胺也是免費的，只是比較難解釋。</sub>
</p>
