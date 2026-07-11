/* UI通しテスト（jsdom）: トップ→STEP1..5→3案→採用→編集→出力 */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://example.github.io/gacha/",
  beforeParse(window) {
    window.addEventListener("error", e => errors.push(e.message));
  }
});
const { window } = dom;
const d = window.document;

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? (pass++, console.log("OK  " + name)) : (fail++, console.error("NG  " + name)); };
const click = el => el.dispatchEvent(new window.Event("click", { bubbles: true }));
const q = sel => d.querySelector(sel);
const qa = sel => [...d.querySelectorAll(sel)];
const chipByText = txt => qa(".choice").find(b => b.textContent.trim().startsWith(txt));

t("初期描画: トップ画面", d.body.textContent.includes("授業設計ガチャ"));
t("初期描画: 個人情報注意あり", d.body.textContent.includes("生徒名"));
t("非公式表記が表示される", d.body.textContent.includes("光村図書出版株式会社とは関係ありません"));

/* STEP1 */
click(qa("[data-nav='step1']")[0]);
t("STEP1表示", d.body.textContent.includes("基本条件"));
click(chipByText("中学2年"));
t("学年選択で教材リスト表示", qa("[data-mat]").length > 5);
click(qa("[data-mat]").find(b => b.textContent.includes("走れメロス")));
t("教材選択反映", qa("[data-mat][aria-pressed='true']").length === 1);
t("授業時間は45分・50分のみ", !!chipByText("45分") && !!chipByText("50分") && qa("[data-key='duration']").length === 2);
t("時間チップに「その他」なし", !qa("[data-key='duration']").some(b => b.textContent.includes("その他")));
click(chipByText("50分"));
click(qa("#next1")[0] || q("#next1"));

/* STEP2 */
t("STEP2表示", d.body.textContent.includes("本時の条件"));
click(chipByText("人物像"));
const cand = qa("[data-obj-cand]")[0];
t("目標候補が表示される", !!cand);
click(cand);
t("候補選択で目標が入り自動判定", q("#objective").value.length > 5 && qa("[data-key='objectiveType'][aria-pressed='true']").length === 1);
click(chipByText("ペア交流を入れる"));
click(q("[data-nav='step3']"));

/* STEP3 */
t("STEP3表示", d.body.textContent.includes("学習傾向"));
click(chipByText("考えはあるが文章化が難しい"));
click(q("[data-nav='step4']"));

/* STEP4 */
t("STEP4表示", d.body.textContent.includes("困っていること"));
click(chipByText("中心発問が決まらない"));
click(q("[data-nav='step5']"));

/* STEP5 → 3案 */
t("STEP5表示", d.body.textContent.includes("ガチャモード"));
t("ガチャボタン有効", !q("#btn-roll").disabled);
click(q("#btn-roll"));
t("3案が描画される", qa(".plan-card").length === 3);
t("方向性短冊が付く", qa(".tanzaku").length === 3);
t("「この案のよさ」欄が3件", qa(".reason").length === 3 && d.body.textContent.includes("この案のよさ"));
t("新見出し: この案でやること", d.body.textContent.includes("この案でやること"));
t("新見出し: 授業の真ん中に置く問い", d.body.textContent.includes("授業の真ん中に置く問い"));
t("新見出し: 生徒の動き", d.body.textContent.includes("生徒の動き"));
t("新見出し: 止まったときの助け", d.body.textContent.includes("止まったときの助け"));
t("新見出し: 最後に考えさせたいこと", d.body.textContent.includes("最後に考えさせたいこと"));
t("折りたたみ: 困ったときの手立てを見る", d.body.textContent.includes("困ったときの手立てを見る"));
t("結果カードに「主な思考操作：」が出ない", !d.body.textContent.includes("主な思考操作"));
t("結果カードに研究文体が出ない", !d.body.textContent.includes("成果物で目標到達") && !d.body.textContent.includes("本案は思考操作"));
t("固定: 全案に実際にペア活動が入る", window.APP_STATE.plans.every(p => p.activities.some(a => a.groupType.includes("pair"))));

/* 項目引き直し＆ロック */
const firstQ = qa(".plan-card")[0].querySelector(".sec-body b").textContent;
click(qa("[data-lock='0:question']")[0]);
click(qa("[data-redraw-card='0']")[0]);
const afterQ = qa(".plan-card")[0].querySelector(".sec-body b").textContent;
t("ロック中の発問は引き直しでも不変", firstQ === afterQ);

/* 採用→編集 */
click(qa("[data-adopt='0']")[0]);
t("編集画面表示", d.body.textContent.includes("授業設計メモの編集"));
t("編集画面に「主な思考操作」が入らない", !d.body.textContent.includes("主な思考操作") && !window.APP_STATE.edited.core.includes("主な思考操作"));
t("編集画面の新見出し", d.body.textContent.includes("この案でやること") && d.body.textContent.includes("気をつけたいこと"));
t("全文コピーに内部用語なし", (() => { const w = window; const txt = w.APP_STATE.edited; return !JSON.stringify(txt).includes("主な思考操作"); })());
const ta = q("[data-edit='memo']");
ta.value = "板書計画は別途"; ta.dispatchEvent(new window.Event("input", { bubbles: true }));

/* 出力 */
click(q("#btn-to-output"));
t("出力画面表示", d.body.textContent.includes("A4印刷"));
click(q("[data-print='1']"));
t("出力前チェック表示", d.body.textContent.includes("出力前の確認"));
t("チェック前は出力ボタン無効", q("#mok").disabled === true);
qa(".check-item").forEach(c => { c.checked = true; c.dispatchEvent(new window.Event("change", { bubbles: true })); });
t("全チェックで出力ボタン有効", q("#mok").disabled === false);
window.print = () => { window.__printed = true; };
click(q("#mok"));
t("印刷シート生成（1枚版）", q("#print-root").textContent.includes("授業設計メモ") && q("#print-root").textContent.includes("板書計画は別途"));
t("A4に正式見出し（授業の中心・学習活動）", q("#print-root").textContent.includes("授業の中心") && q("#print-root").textContent.includes("学習活動"));
t("A4に内部タグが出ない", !q("#print-root").textContent.includes("主な思考操作") && !q("#print-root").textContent.includes("成果物で目標到達"));
setTimeout(() => {
  t("window.print呼び出し", window.__printed === true);

  /* 部分ガチャ・困りごとガチャ（出力→編集→結果→STEP5と戻る） */
  click(qa("button").find(b => b.dataset.nav === "edit"));
  click(qa("button").find(b => b.dataset.nav === "result"));
  click(qa("button").find(b => b.dataset.nav === "step5"));
  const modePartial = qa(".choice").find(b => b.textContent.includes("部分ガチャ"));
  click(modePartial);
  click(qa(".choice").find(b => b.textContent.trim() === "中心発問"));
  click(q("#btn-roll"));
  t("部分ガチャ結果表示", d.body.textContent.includes("部分ガチャの結果"));

  const back2 = qa("button").find(b => b.dataset.nav === "step5"); click(back2);
  click(qa(".choice").find(b => b.textContent.includes("困りごと解決")));
  click(q("#btn-roll"));
  t("困りごと打ち手表示", d.body.textContent.includes("打ち手1"));

  t("実行時エラーなし", errors.length === 0);
  if (errors.length) console.error(errors);
  console.log(`\nUIテスト結果: ${pass} passed / ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 200);
