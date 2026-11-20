import assert from "node:assert/strict";
import { PLAYER_GIVEN_NAMES, PLAYER_JAPAN_SURNAMES, PLAYER_SURNAMES,
  PLAYER_TAIWAN_SURNAMES } from "../src/data/player-names.js";
import { generatePlayerName } from "../src/utils/player-name-generator.js";

assert.equal(PLAYER_TAIWAN_SURNAMES.length, 35);
assert.equal(PLAYER_JAPAN_SURNAMES.length, 6);
assert.deepEqual(PLAYER_JAPAN_SURNAMES, ["大谷", "山本", "佐藤", "鈴木", "伊藤", "高橋"]);
assert.equal(PLAYER_SURNAMES.length, 41);
assert.equal(new Set(PLAYER_SURNAMES).size, 41);
assert.equal(PLAYER_GIVEN_NAMES.length, 99);
assert.equal(new Set(PLAYER_GIVEN_NAMES).size, 99);

for (const removed of ["村上", "岡本", "近藤", "宮城", "源田", "周東", "森下", "小園",
  "菊池", "吉田"]) {
  assert.equal(PLAYER_SURNAMES.includes(removed), false, `${removed} 應已移除。`);
}
for (const removed of ["壯亮", "志遠", "昱翔"]) {
  assert.equal(PLAYER_GIVEN_NAMES.includes(removed), false, `${removed} 應已移除。`);
}
for (const added of ["政閔", "金鋒", "智勝", "泰山", "岱綱", "偉殷", "建民", "志綱",
  "威倫", "威", "建福", "菜頭", "阿綸", "小茂", "文獻", "博偉", "鳳"]) {
  assert.equal(PLAYER_GIVEN_NAMES.includes(added), true, `${added} 應存在。`);
}
assert.equal(PLAYER_GIVEN_NAMES.filter((name) => name === "建民").length, 1);

function sequenceRandom(...values) {
  let index = 0;
  return () => values[index++];
}

PLAYER_SURNAMES.forEach((surname, index) => {
  const generated = generatePlayerName(sequenceRandom(
    (index + 0.5) / PLAYER_SURNAMES.length, 0));
  assert.equal(generated, `${surname}${PLAYER_GIVEN_NAMES[0]}`,
    `姓氏 ${surname} 應占相同寬度的抽樣區間。`);
});
PLAYER_GIVEN_NAMES.forEach((givenName, index) => {
  const generated = generatePlayerName(sequenceRandom(
    0, (index + 0.5) / PLAYER_GIVEN_NAMES.length));
  assert.equal(generated, `${PLAYER_SURNAMES[0]}${givenName}`,
    `名字 ${givenName} 應占相同寬度的抽樣區間。`);
});

const japaneseSurnameIndex = PLAYER_SURNAMES.indexOf("大谷");
const taiwanGivenNameIndex = PLAYER_GIVEN_NAMES.indexOf("金鋒");
assert.equal(generatePlayerName(sequenceRandom(
  (japaneseSurnameIndex + 0.5) / PLAYER_SURNAMES.length,
  (taiwanGivenNameIndex + 0.5) / PLAYER_GIVEN_NAMES.length)), "大谷金鋒");

for (const singleName of ["威", "鳳"]) {
  const index = PLAYER_GIVEN_NAMES.indexOf(singleName);
  assert.equal(generatePlayerName(sequenceRandom(0, (index + 0.5) / PLAYER_GIVEN_NAMES.length)),
    `${PLAYER_SURNAMES[0]}${singleName}`);
}

const fixedValues = [0.73, 0.42];
const first = generatePlayerName(sequenceRandom(...fixedValues));
const second = generatePlayerName(sequenceRandom(...fixedValues));
assert.equal(second, first, "固定 RNG 序列必須重現相同姓名。 ");

console.log("Player name generator tests passed.");
