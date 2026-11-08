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

## Phase 2D-C1：進攻站位資料編輯

首頁進入「六人接發球實驗」→「編輯進攻站位」，選擇輪次 R1～R6、固定球員槽位及進攻類型。READY（綠色圓標記）與 ATTACK（粉色菱形標記）分別輸入 X／Y，或按「在球場設定」後點選右半場，再拖曳微調。座標使用世界像素，沿用六人實驗接球方範圍 X 1140～2280、Y 0～900，以及 Camera 的縮放／位移轉換。

資料模組為 `src/simulator/attack-positions.js`。JSON 格式是 `{ "version": 1, "receivingSide": "RIGHT", "entries": [...] }`；每筆以 `rotation`、`playerSlot`、`attackType` 唯一識別，分別儲存 `readyPosition`、`attackPosition`（`{x,y}` 或 `null`）及衍生 `status`。兩點完整才是 `CONFIGURED`，缺任一點為 `UNCONFIGURED`。未列出的組合不會自動生成座標；目前正式預設僅含 C3 使用者確認的 R1／OH1／LEFT_LONG，其他 179 組仍未設定。五種進攻類型僅為資料分類，本階段不判定實際輪轉、前後排或進攻資格。

「匯出全部 JSON／複製 JSON」包含所有已設定及部分設定的草稿。貼上 JSON 後按「驗證並匯入 JSON」會取代草稿；格式、版本、重複組合、非有限數值或超出半場會拒絕匯入並保留原草稿。未設定的點需明確使用 `null`，不可省略欄位。

「套用預覽」保留本次頁面的預覽快照，「重設未套用修改」回到上次快照（首次為正式預設）；都不覆寫正式預設、不寫入 Match Engine、不移動球員。開啟時暫停實驗並停用發球點擊，關閉後恢復原流程。一傳區域與進攻站位編輯互斥。沒有後端或持久化儲存，重新整理前請自行保留 JSON。

必要資料與整合測試：`node tools/test-attack-positions.mjs`。

## Phase 2D-C2：四號位長攻跑位實驗

六人實驗新增可選的 LEFT_LONG 跑位。C3 已提供一組使用者確認的 R1／OH1 正式預設；其他組合先在 C1 編輯器設定兩點並「套用預覽」。勾選「啟用 LEFT_LONG 跑位實驗」，選擇查詢輪次與負責球員，點球場發球。S 與第二觸球執行者不支援；未設定兩點時顯示 `UNCONFIGURED` 並拒絕啟動。編輯草稿在套用前不影響實驗，啟動後的 Assignment 固定使用該次資料，不會自動補入其他站位。

`attack-assignment.js` 的輕量任務以 `attackType`、`assignedPlayerId`、`readyPosition`、`attackPosition`、`movementPhase` 描述負責人與目標。C1 的 `rotation × playerSlot × LEFT_LONG` 僅是入口相容查詢，任務本身不綁定 OH1，也不修改球員身份、槽位或觸球資格。畫面顯示資料來源、階段、目標座標與距離，綠／粉標記僅供觀察。

成功一傳事件（PERFECT／NORMAL）→ `MOVING_TO_READY`；若負責人剛完成接球，依既有動畫時長等待模擬時間解除鎖定。真實碰撞產生 `SECOND_TOUCH` → `MOVING_TO_ATTACK`，從目前實際座標直接轉向，不要求先到 READY。到達 ATTACK → `ATTACK_READY`。所有移動沿用 Player Agent 與固定時間步進，不依賴 CSS 動畫完成回呼或畫面 FPS。

專用 `left-long-simulator.js` 保留兩階段跑位，第二觸球後已由 C3 擴充為同步第三段球路（見下節），不再停球等待跑位。BAD、一傳失敗、第二觸球失敗與重設會清理當次任務。停用實驗時維持原本 `SECOND_TOUCH_COMPLETE` 停止行為；不實作得分、其他進攻類型或輪次自動指派。

必要測試：`node tools/test-left-long.mjs`；C1 相容測試：`node tools/test-attack-positions.mjs`。測試座標只存在測試 fixture，不是正式預設。

## Phase 2D-C3：第三段球路與攻擊觸球

正式預設只新增使用者確認的 `R1 / OH1 / LEFT_LONG`，保留原始精度：READY `{x: 1422.0553176739254, y: 759.6263406329012}`；ATTACK `{x: 1268.25, y: 673.6953125}`。其他 179 組仍為 `UNCONFIGURED`，不會套用這組座標給其他球員或輪次。

六人實驗勾選 LEFT_LONG 即可使用此預設。`third-pass.js` 的暫時測試參數為飛行時間 **1.6 秒**、額外弧度 **260 世界像素**、接觸高度 **180 世界像素**，尚未正式定案；可由實驗畫面調整，下一次發球生效。時間指沒有碰球時到自然落地的總時間；弧度是線性基線上的拋物線加成，不是精確最高高度。可設定時間 0.1～10 秒、接觸高度 160～400、弧度介於接觸高度與 1000；後者是本次規劃器的有效參數限制，避免無法到達接觸高度。沒有依球員距離自動延長或修正球路。

只有真實 `SECOND_TOUCH` 成功才進入 `THIRD_PASS_IN_FLIGHT`，同時切換 ATTACK 跑位。第三段起點完全沿用第二觸球球心的 X／Y／高度。規劃器依 ATTACK 頭像左上方接觸偏移與指定高度求下降段時間比例，再反推落地點，交給既有 Ball 模組產生連續軌跡；ATTACK 球員座標不是球心終點，也不會等待球員先到達再開始飛球。

`attack-contact.js` 集中 ATTACK 幾何：頭像半徑 65、球半徑 32.5（沿用既有尺寸），向左預期接觸偏移約 `(-54.993, -31.75)`，向右鏡像；水平／垂直橢圓容差各 18、可見重疊至少 16、相對頭像的接觸高度容差 ±20（預設 160～200），最低基準高度 140，單位均為世界像素。判定獨立於 RECEIVE／SET，同時求跨步進的橢圓、可見重疊圓與高度區間交集；只允許第三段 `IN_PLAY` 中的指定攻擊手，接球動作鎖定時不執行攻擊接觸。D1 已接入實際 `jumpHeight`／一次性 `anticipatedJumpHeight`，詳見下節。

真實碰撞後產生 `THIRD_TOUCH`，記錄球員、時間、球與球員位置、球高度及重疊深度，顯示 `THIRD_TOUCH_COMPLETE` 並停在碰撞位置。不碰球而自然落地或出界時產生 `THIRD_TOUCH_MISSED`，原因為 `BALL_LANDED` 或 `OUT_OF_BOUNDS`，不偽造第三觸球。Debug 顯示起點、預計接觸點、剩餘時間、高度及攻擊手到 ATTACK 的距離。沒有扣球、攔網、第四段球路或得分。

必要測試：`node tools/test-third-touch.mjs`；既有跑位與 C1 相容測試仍使用前述兩個測試指令。

## Phase 2D-D1：固定步進攻擊跳躍與連續旋轉

LEFT_LONG 實驗新增 `attack-motion.js`，不依賴 CSS 動畫或動畫完成回呼。獨立狀態包含 `jumpPhase`、`jumpHeight`、`rotationAngle`、`jumpElapsed`、`jumpDuration`、一次性的預測觸球／起跳時間及實際起跳位置。球員地面 X／Y 只由既有 Player Agent 移動；起跳須實際抵達 ATTACK 且解除接球動作鎖，起跳後地面座標保持不動，未瞬移或加速。

V1 測試預設（尚未正式定案）：最高跳躍 **60 世界像素**、總時間 **1 秒**、起跳 **0.10 秒**、拉弓 **0.20 秒**、揮擊 **0.12 秒**、剩餘 **0.58 秒**完成後續旋轉與落地。方向可選 LEFT／RIGHT。起跳最多允許比原排程晚 **0.10 秒**；仍未到達 ATTACK 則標記 `SKIPPED`，不為等待攻擊手修正球路。接觸時窗為揮擊最後 **4°**，由固定步進中的時間區間裁切掃掠碰撞。

向左角度為 `0 → +30 → −30 → −360`，向右完全鏡像；保留連續未取餘數的角度，落地後保留 ±360°（視覺等同 0°），不突然回正。高度在預定揮擊末端達到最高點，之後平滑下降。Renderer 僅依快照對整個 motion 層做 `translateY(-jumpHeight × Camera scale)` 與旋轉，照片、外框、姓名縮寫一起運動；不改寫地面位置或球路。

接觸高度 **180 ±20** 現為相對於跳躍頭像的高度。第三段開始時，以預期跳躍 60 計算世界接觸高度 **240**，只做一次球路與起跳排程，之後不重啟動畫或補正球路。暫時參數限制為弧度至少等於相對接觸高度加跳躍高度；不符合時拒絕啟動，不自動調整數字。實際碰撞使用當步的 `jumpHeight`、可見重疊及揮擊時窗，只有幾何相交才產生 `THIRD_TOUCH`。

成功或已起跳後揮空時，先保留 `thirdTouchStatus` 的 `THIRD_TOUCH_COMPLETE`／`THIRD_TOUCH_MISSED` 結果，Simulator 進入 `ATTACK_LANDING`，球保持真實碰撞／失敗位置；只繼續攻擊手旋轉落地。落地後才切換為對應終止 Status，不生成第四段球路。Debug 顯示跳躍階段、高度、連續角度、預測／實際觸球時間、相對距離與落地狀態。一般六人模式仍停在原本的第二觸球。

必要動畫測試：`node tools/test-attack-motion.mjs`；C3／C2 的相關測試也保留並配合跳躍後幾何及落地流程驗證。

## Phase 2D-D2：指定落點扣球與第四段球路

六人實驗啟用 LEFT_LONG 與 D2 後，先選「設定扣球落點（不發球）」並點對方左半場，再切回「設定發球落點（啟動 Rally）」點球場。可重選或輸入精確 X／Y、清除目標；未設定有效目標時禁止 D2 發球。發球後目標及參數複製為本 Rally 的不可變設定，整段不需再次操作。青色 12px 小點不攔截點擊，沿用 Camera 座標轉換。關閉 D2 可沿用 D1；未啟用 LEFT_LONG 的一般接發球流程不受影響。

D2 動畫預設採用使用者確認的向左、跳高 60、總時間 0.8 秒；起跳 0.1、拉弓 0.2、揮擊 0.1、後續旋轉／落地 0.4 秒。`D2_ATTACK_MOTION_V1` 不覆寫 D1 的參數來源；畫面仍可調整，向右鏡像可在關閉 D2 時測試，本次不支援向右扣球。

`spike-simulator.js` 僅在真實 `THIRD_TOUCH` 成功後立刻產生 `SPIKE_STARTED`，以該觸球球心 X／Y／height 啟動既有 Ball 的第四段，進入 `SPIKE_IN_FLIGHT`，與落地動畫同步固定步進。第三觸球失敗時沒有第四段。扣球暫時預設：**0.65 秒**、弧度 **0**（直線下墜）；可調時間 0.05～3 秒、弧度／下墜 -200～300。負弧度可能提早接觸地面，不會強制讓球到達指定點。

現有專案沒有實體球網高度及有效邊線幾何。`spike-court.js` 因此獨立定義明確標示為暫定的 V1：網平面沿用世界左右半場分界 **X=1140**；網高 **160 世界像素**（非正式高度，可由 UI 調整）；網 Y 範圍 **90～810**；有效場界先取世界邊緣內縮 10% 的矩形 **X=228～2052、Y=90～810**，對方半場在 X=1140 截斷。這是實驗假設，不是背景場地圖的物理校準，需後續確認；細虛線由同一份資料繪出。左半場世界內的場外目標仍可指定，以測試 OUT。

球半徑沿用 **32.5**；網接觸容差 **0.5**、邊線／端線容差各 **1 世界像素**均集中管理。`spike-flight.js` 使用同一條 Ball 軌跡的分段多項式求連續球體與有限網矩形的第一交點，包含網頂／側緣與高速跨步進。地面判定在球心高度等於半徑時發生；地面目標 `height=0`，實際球心停在 **32.5**，球底剛好為 0，Renderer 沒有補正。Ball 只新增可選的 `target.height`，其他既有球路仍預設為 0。

結果為 `SPIKE_NET`、`SPIKE_LANDED` 或 `SPIKE_OUT`；場內判定採球體地面投影圓與含容差的對方矩形相交（含壓線），不以方框代替圓處理角落。若結果先於攻擊手落地，進入 `SPIKE_LANDING` 保持球的真實停止位置，待動畫完成才顯示終止 Status。這些事件不代表得分，不新增攔網、對方接球、輪次分配或其他攻擊類型。

必要測試：`node tools/test-spike.mjs`，涵蓋三種結果、網頂／側緣球體幾何、高速掃掠、落地半徑、目標鎖定、同步動畫、第三觸球失敗、一般模式及 30／144 FPS 一致性。

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
