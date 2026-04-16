# 圖鑑／README 用圖

若要讓 `README.md` 顯示**實際遊戲畫面**（養成、圖鑑、大廳、對戰），可將 PNG 或 WebP 放在本目錄，並在 README 內改成對應檔名：

| 建議檔名       | 內容說明           |
|----------------|--------------------|
| `screen-care.png`  | 養成主畫面         |
| `screen-dex.png`   | 夥伴圖鑑         |
| `screen-lobby.png` | 連線大廳／開房   |
| `screen-battle.png`| 對戰中畫面       |

GitHub 會以專案根路徑解析 Markdown 圖片，例如：

```md
![養成](docs/readme/screen-care.png)
```

目前 README 預設使用 `public/pets/` 內精靈圖作為**美術示意**（已納版控，不會破圖）。
