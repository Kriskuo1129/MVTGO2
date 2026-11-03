export const WORLD_SIZE = Object.freeze({
  width: 2280,
  height: 900,
});

export const DEFAULT_COURT_ID = "court-01";

export const COURTS = Object.freeze({
  "court-01": Object.freeze({
    id: "court-01",
    name: "正式場地 01",
    imagePath: "./assets/courts/court-01.png",
  }),
  "court-template": Object.freeze({
    id: "court-template",
    name: "場地線稿範本",
    imagePath: "./assets/courts/court-template.png",
  }),
});

export function getCourtConfig(courtId) {
  const court = COURTS[courtId];
  if (!court) {
    throw new RangeError(`未知的場地 ID：${courtId}`);
  }
  return court;
}
