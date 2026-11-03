// 正式比賽共用參數：直接修改數值並重新載入頁面，一般模式與 ?dev 共用。

// 排球飛行速度（世界像素／秒）。上層指定 speed 或 duration 時沿用既有覆寫規則。
export const BALL_SPEED_DEFAULT = 725;
export const SERVE_SPEED_NORMAL = 700;
export const JUMP_SERVE_SPEED = 900;

// 發球速度預留值（世界像素／秒）：尚未接線，不影響目前比賽，亦無速度等級抽選。
export const SERVE_SPEED_SLOW = 1300;
export const SERVE_SPEED_FAST = 1750;
export const SERVE_SPEED_MAX = 2000;

// 球員移動速度（世界像素／秒）。
export const PLAYER_MOVE_SPEED = 400;

// 接球移動速度預留值（世界像素／秒）：尚未接線，不影響目前 RECEIVE 或 MOVE。
export const PLAYER_RECEIVE_MOVE_SPEED = 560;
