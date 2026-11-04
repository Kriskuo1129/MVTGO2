# 系排GO MVTGO2

MVTGO2 是完全重新開發的排球即時系統。本 Repository 不沿用舊版 MVTGO 的程式、文件、素材、座標或規則。

目前完成範圍為 **Phase 3A：即時 Match Engine 與發球 ACE／失誤**。正式遊戲首頁將已驗證資料交給比賽主程式，完成先發確認後建立 Match；單次發球事件由正式 Engine 依序執行 Resolver、Player Behavior、動畫完成等待及 Rules 得分結算。

## 架構原則

- 場上由 HOME 左側、AWAY 右側共 12 名球員與一顆排球構成。
- 每位球員共同讀取目前比賽狀態，並依球隊、輪次、職位及狀態取得單一主要行為。
- 狀態改變時立即切換行為，球員從實際座標繼續移動，不瞬移，球員彼此不直接控制。
- 站位座標屬於行為參數，不建立獨立站位系統。
- 一般移動與接球速度為全員共用，不建立個別跑速屬性。
- 所有球員共用同一套 ATTACK 動畫：原地垂直起跳、翻滾扣殺並落地；攻擊前的移動由 MOVE 負責，ATTACK 不包含助跑。
- 不設計個人攻擊動作或個人攻擊速度；SERVE 與 JUMP_SERVE 為兩種正式發球動畫。
- Match 的唯一排球具有獨立高度，並共用正式接觸點與球路機制；目前只有發球完成球員與排球同步，其他觸球動作等待 Rally 串接。
- 比賽系統負責觸球、能力、結果與比分判定，不採用完整物理引擎。
- 站位、速度、球路及行為設定採模組化設定檔，透過修改設定調整，不開發 Editor。
- 遵循當前階段的明確需求，不預先擴充未定義規則、戰術或管理器。

## 專案結構

```text
MVTGO_NEW/
├─ 啟動測試網站.bat
├─ index.html
├─ README.md
├─ .gitignore
├─ tools/
│  └─ local-server.ps1
└─ src/
   ├─ main.js
   ├─ config/
   │  ├─ app.config.js
   │  └─ match-params.js
   ├─ court/
   │  ├─ ball-trajectory.js
   │  ├─ camera.js
   │  ├─ court-config.js
   │  ├─ court-view.js
   │  ├─ player-action-config.js
   │  ├─ player-action-controller.js
   │  ├─ player-contact-point.js
   │  └─ world-scene.js
   ├─ data/
   │  ├─ player-names.js
   │  └─ test-players.js
   ├─ display/
   │  └─ player-display.js
   ├─ lineup/
   │  └─ starting-lineup.js
   ├─ match/
   │  ├─ match-main.js
   │  ├─ match-engine.js
   │  ├─ match-resolver.js
   │  ├─ match-rules.js
   │  ├─ player-behavior.js
   │  ├─ lineup-ui.js
   │  ├─ create-pregame-match-input.js
   │  ├─ create-match.js
   │  └─ match-state.js
   ├─ models/
   │  └─ player.js
   ├─ testing/
   │  ├─ create-test-pregame-match-input.js
   │  ├─ create-random-test-lineup.js
   │  └─ serve-result-override.js
   ├─ utils/
   │  └─ player-name-generator.js
   └─ styles/
      └─ main.css
```

## 正式比賽參數調整

正式共用速度集中於 `src/config/match-params.js`，直接修改常數右側的數值，儲存後重新載入頁面即可；一般模式與 `?dev` 使用同一份參數，不需修改公式或函數。

以下參數單位皆為「世界像素／秒」：

| 參數 | 預設值 | 接線狀態 |
| --- | --- | --- |
| `BALL_SPEED_DEFAULT` | 725 | 已接線：未指定速度的一般球路 |
| `SERVE_SPEED_NORMAL` | 700 | 已接線：正式 SERVE |
| `JUMP_SERVE_SPEED` | 900 | 已接線：正式 JUMP_SERVE |
| `PLAYER_MOVE_SPEED` | 400 | 已接線：正式 MOVE |
| `SERVE_SPEED_SLOW` | 1300 | 尚未接線：預留 |
| `SERVE_SPEED_FAST` | 1750 | 尚未接線：預留 |
| `SERVE_SPEED_MAX` | 2000 | 尚未接線：預留 |
| `PLAYER_RECEIVE_MOVE_SPEED` | 560 | 尚未接線：預留 |

上層明確指定球路 `speed` 時優先使用該速度，指定 `duration`（毫秒）時優先使用該飛行時間。既有球路最短 80 毫秒、MOVE 最短 120 毫秒的限制維持不變。預留參數目前不影響比賽，沒有速度等級抽選規則。

## 啟動方式

本專案無外部依賴與建置步驟。雙擊專案根目錄的 `啟動測試網站.bat`，即可使用 Windows 內建 PowerShell 啟動僅限本機連線的靜態網站，並自動開啟 `http://localhost:8080/`。停止時在命令視窗按 `Ctrl+C`。

啟動工具不需要 Python、Node.js、npm 或第三方套件，也不會修改系統 Execution Policy。由於 JavaScript 使用 ES Module，不建議直接以 `file://` 開啟 `index.html`。

## Phase 1A 操作方式

1. 在首頁點選「比賽測試系統」；「開始遊戲」將於未來養成系統完成後開放。
2. 在 HOME 先發名單畫面點擊六個槽位，從選人視窗安排球員。
3. 同一球員被選取後，其他槽位會停用該球員；可更換或清除既有選擇。
4. 六個職位完成後，點選「確認」產生正式配置資料。
5. 系統使用雙方球員與先發配置建立正式 Match，並進入球場畫面。

賽前資料可透過 `homeDefaultStartingLineup` 傳入 HOME 預設先發，格式為六個固定槽位對應穩定球員 ID；合法資料會先填入既有先發畫面，玩家仍需確認且可手動更換。無效資料會安全退回手動選擇。首頁「比賽測試系統」由 `src/testing/create-test-pregame-match-input.js` 準備測試球員與隨機先發，再通過正式輸入驗證；後續共用正式編輯、Match 建立與確認流程，且與網址的 `?dev` 開發工具互不相同。

外部系統應先呼叫 `src/match/create-pregame-match-input.js` 的 `createPregameMatchInput()` 建立正式賽前輸入，再交給 `beginPregameFlow()`。此入口會使用正式球員模型重新驗證並封存雙方名單；AWAY 先發必須明確提供六個職位與球員 ID，不依賴名單陣列順序。

`src/main.js` 是《系排GO》遊戲主程式入口，只負責首頁初始化、維持尚未開放的「開始遊戲」入口，以及將「比賽測試系統」準備的資料交給比賽系統。`src/match/match-main.js` 是比賽主程式，接收已驗證輸入並管理賽前流程、正式 Match 建立與球場啟動；`src/match/lineup-ui.js` 只管理先發槽位、選人視窗、能力顯示與選擇／清除／確認操作，不自行建立 Match。正式資料由 `createPregameMatchInput()` 準備，測試資料由 `src/testing/create-test-pregame-match-input.js` 準備。

球員資料包含唯一 ID、名稱、擅長職位（`S`、`OH`、`MB`、`OP`）、五項能力、情緒、發球類型與可為空的頭像識別欄位。測試資料和未來正式資料共用相同格式。

先發槽位依正式版型排列為上排 `OP、MB1、OH1`、下排 `OH2、MB2、S`。球員擅長職位若與槽位對應職位不同，畫面顯示「有錯位、能力值會下降」，但仍允許確認；本階段不計算下降幅度。比賽名稱與雙方隊名均由本場比賽資料傳入，不在畫面中硬編碼。

正式畫面使用黑金主題。情緒仍以 1～5 儲存在資料中，畫面依序顯示為淡定、冷靜、一般、熱情、瘋狂；五項能力依共用分級樣式顯示，90～99 為金屬金、80～89 粉、70～79 紅、60～69 黃、50～59 藍、1～49 灰。共用顯示規格位於 `src/display/player-display.js`。

## Phase 1B Match 與球場入口

正式 Match 包含唯一 ID、比賽與雙方隊名、雙方完整名單、雙方先發配置、初始輪次 `R1`、狀態 `PRE_MATCH`、比分 `0:0`，以及暫留的戰術欄位。Match 直接沿用賽前流程的球員與先發資料，不重新產生球員。

球場畫面從 Match 取得 12 名先發球員，並以球員 ID、球隊識別及先發槽位建立畫面標記。現階段集中設定的世界座標只供畫面占位，不是正式輪次站位或球員行為規則。

## 姓名資料與生成

正式姓名參數位於 `src/data/player-names.js`。可直接在 `PLAYER_SURNAMES` 或 `PLAYER_GIVEN_NAMES` 陣列中新增、修改或刪除字串選項，檔案使用 UTF-8 繁體中文。

`src/utils/player-name-generator.js` 提供正式共用的 `generatePlayerName` 函數。一般功能使用預設隨機來源；測試資料則注入固定種子亂數，以維持結果可重現。未來養成系統招募球員時應沿用此共用函數，不另建姓名生成規則。

## 後續開發階段

### Phase 2A：正式場景、世界座標與水平鏡頭

- 正式場地設定集中於 `src/court/court-config.js`，世界尺寸固定為 2280 × 900；Match 透過 `courtId` 選擇 `court-01` 或 `court-template`。
- 球員與排球均使用完整場地圖片的原始像素座標，畫面縮放與鏡頭移動不會修改世界座標。
- `src/court/camera.js` 僅平滑追蹤排球的 X 座標，Y 軸固定，並限制鏡頭不得超出世界左右邊界。
- 場地背景、12 名球員及排球位於同一個世界場景容器，共用相同座標轉換；目前集中設定的初始座標僅供畫面占位，不代表正式輪次站位。
- 在網址加上 `?dev` 可開啟最小開發檢視功能：點擊球場讀取世界座標、複製座標，以及調整測試球 X 位置驗證鏡頭。這些工具不會修改比分或比賽狀態。
- 下方戰術與暫停區目前僅保留停用的介面位置，尚未實作任何戰術、暫停或 Rally 規則。

### Phase 2B：正式球員外觀與動作

- 正式場上球員使用圓形頭像；圖片與外框位於同一個變形層，無圖片或載入失敗時顯示姓名縮寫。
- `src/court/player-action-controller.js` 提供 `IDLE`、`MOVE`、`RECEIVE`、`SET`、`ATTACK`、`BLOCK`、`SERVE`、`JUMP_SERVE` 共用動作 API。
- 世界座標、動作位移與頭像形變分層處理；MOVE 更新 Match 場景中的世界座標，跳躍、旋轉與壓縮不會覆蓋世界座標。
- 動作節奏及形變幅度集中在 `src/court/player-action-config.js`，新動作可中斷舊動作，舊完成回呼不會覆蓋目前動作。
- SERVE 與 JUMP_SERVE 使用 Match 場景中的同一顆正式排球；正式動作必須接收 Match Engine 提供的 `serveTrajectory`，不自行決定正式落點，也不包含得分、碰撞或球路結果。
- `?dev` 模式可直接選擇正式場上球員並呼叫相同動作 API；測試落點由明確標示為開發用途的球路函數提供，並能一鍵恢復進入球場時的球員及排球座標。

### Phase 2C：正式高度、接觸點與排球飛行

- Match 的唯一正式排球使用 `x`、`y` 地面投影座標及獨立 `height`；顯示位置統一為 `y - height`，Camera 仍只追蹤世界 X。
- `src/court/player-contact-point.js` 依球員世界座標、動作跳躍高度、頭像／排球尺寸、動作及球隊方向計算正式接觸點，不受頭像翻滾角度影響。
- `src/court/ball-trajectory.js` 以 X、Y、高度差計算距離，依集中球速產生飛行時間，也允許 Match Engine 明確指定時間。
- 正式 SERVE／JUMP_SERVE 的 `serveTrajectory` 必須由上層提供拋球點、接觸點與目標；控制器驗證接觸點後，以正式速度執行簡單線性飛行，不判定碰撞、得分或結果。
- `?dev` 沿用正式控制器與軌跡介面，並顯示排球目前的世界 X、Y 與高度。

### Phase 2G：遊戲主程式與比賽系統責任整理

- `src/main.js` 定位為整個《系排GO》的首頁入口，不包含先發 UI、Match 建立或球場初始化細節。
- `src/match/match-main.js` 統一接收正式比賽輸入，串接賽前先發確認、Match 建立及正式球場畫面。
- `src/match/lineup-ui.js` 封裝六個先發槽位與球員選擇操作，並沿用 `starting-lineup.js` 的正式驗證與編輯邏輯。
- 正式資料與測試資料只在準備來源上分離，後續共用相同比賽主流程、Match、球場、Camera、動畫及未來即時系統。

### Phase 3A：即時 Match Engine 與發球事件

- `src/match/match-engine.js` 管理單次發球事件狀態，只在正式動畫完成後呼叫規則結算，結束後不自動開始下一次 Rally。
- `src/match/match-resolver.js` 使用發球能力、發球類型及可注入亂數判定 ACE 或發球失誤；目前公式為集中管理的暫定平衡。
- `src/match/player-behavior.js` 依發球權、輪轉及正式先發安排發球員、動作與球路目標，其他十一名球員不執行額外動作。
- `src/match/match-rules.js` 統一處理 ACE／發球失誤得分及下一發球權；OUT 與 NET 只影響球路呈現，規則結果相同。
- 比賽測試系統可強制指定 ACE、OUT 或 NET，但覆寫發生在正式 Resolver 完成後，後續仍使用正式 Behavior、動畫與 Rules。

1. 定義並接入正式球員資料來源。
2. 依核准規格逐步加入即時比賽狀態。
3. 在規則與資料契約確認後，才串接其他觸球動作與正式 Rally 流程。

完整 Rally、戰術介面、換人、輪轉計算與站位編輯尚未實作。
