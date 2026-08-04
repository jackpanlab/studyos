StudyOS 3.1 修正版

修正重點：
1. 將 data.js 與 app.js 移到所有 HTML 元件之後載入。
2. 修正編輯課程按鈕與視窗因 DOM 尚未建立而初始化失敗。
3. 修正首頁天數顯示為「—」的問題。
4. 更新 Service Worker 快取版本，避免持續看到舊版。
5. 不含 _redirects，可直接由 GitHub 自動部署至 Cloudflare Workers。

GitHub 上傳檔案：
404.html、README.txt、app.js、data.js、index.html、manifest.json、style.css、sw.js
