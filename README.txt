StudyOS 3.0 正式版

部署重點：
1. 請先解壓縮 ZIP。
2. 上傳解壓後「資料夾內的所有檔案」，不可直接上傳 ZIP。
3. index.html 必須與 app.js、style.css 位於上傳根目錄。
4. Cloudflare 部署完成後按 Ctrl+F5。
5. 本版包含 404.html 與 _redirects，避免根網址或重新整理出現 404。

主要功能：
- 保留 studyos-state localStorage 相容性
- 今日任務、智慧排程、行事曆、五科進度
- 課程名稱與精準片長修改
- 觀看位置、播放倍速、筆記、重點、今日必看
- 完成／未完成、隱藏與恢復課程
- 8 秒復原
- JSON 備份匯出與匯入
- PWA / Service Worker
