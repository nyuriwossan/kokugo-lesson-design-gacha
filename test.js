/* 授業設計ガチャ エンジンスモークテスト */
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const scriptAll = html.split("<script>")[1].split("</script>")[0];

/* 1) 全スクリプトの構文チェック（DOM部含む） */
new vm.Script(scriptAll); // throws on syntax error
console.log("OK  構文チェック（全スクリプト）");

/* 2) エンジン部のみ実行 */
const engine = scriptAll.split("/* ===== ENGINE-END ===== */")[0];
const sandbox = { console, Math, JSON, Object, Array, String, Number };
vm.createContext(sandbox);
vm.runInContext(engine, sandbox);
/* const宣言はsandboxのプロパティにならないため、評価プロキシで参照する */
const P = new Proxy({}, { get: (_, name) => vm.runInContext(String(name), sandbox) });

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log("OK  " + name); }
  else { fail++; console.error("NG  " + name); }
}
const S = P;

/* 目標タイプ判定 */
t("目標判定: 根拠優先", S.detectObjectiveType("叙述を根拠に、人物の考え方を説明できる。") === "根拠を挙げる");
t("目標判定: 比較", S.detectObjectiveType("二つの場面を比較して違いを述べられる。") === "比較する");
t("目標判定: 要約", S.detectObjectiveType("文章を要約できる。") === "要約する");
t("目標判定: 判定不能はnull", S.detectObjectiveType("楽しく学ぶ。") === null);
t("曖昧な目標に警告", typeof S.checkObjectiveWording("作品の主題を理解する。") === "string");
t("観察可能な目標は警告なし", S.checkObjectiveWording("叙述を根拠に説明できる。") === null);

/* 教材マスタ */
t("教材: 3学年ぶん存在", [1, 2, 3].every(g => S.materialsByGrade(g).length >= 10));
t("教材: 段階と目標タイプ付与", S.MATERIALS.every(m => m.stages.length && m.objectiveTypes.length));

/* 目標候補 */
t("目標候補: 文学×人物像", S.getObjectiveCandidates("lit", "人物像").length >= 2);
t("目標候補: 未定義段階はフォールバック", S.getObjectiveCandidates("gram", "練習").length >= 1);

/* コンテキスト */
function ctx(over) {
  return Object.assign({
    grade: 2, material: S.getMaterial("g2-011"), lessonStage: "人物像",
    duration: 50, environment: ["教科書", "ワークシート"],
    objective: "叙述を根拠に、人物の考え方を説明できる。",
    objectiveType: "根拠を挙げる",
    currentQuestion: "", currentActivity: "",
    fixedElements: [], avoidedElements: [], classTendencies: [], concerns: []
  }, over || {});
}

/* フィルタ */
const c1 = ctx({ avoidedElements: ["端末利用", "長文記述"] });
const acts1 = S.filterActivities(c1);
t("フィルタ: 候補が存在", acts1.length >= 3);
t("フィルタ: 端末必須が除外", acts1.every(a => !a.requires.includes("生徒用端末")));
t("フィルタ: 長文記述が除外", acts1.every(a => a.outputType !== "long-writing"));

const c2 = ctx({ avoidedElements: ["ペア活動", "グループ活動"] });
const acts2 = S.filterActivities(c2);
t("フィルタ: ペア/グループ専用が除外", acts2.every(a => S.usableGroupTypes(a, c2.avoidedElements).length > 0));

const c3 = ctx({ environment: ["教科書"] });
t("フィルタ: ミニWB不所持で除外", S.filterActivities(c3).every(a => !a.requires.includes("ミニホワイトボード")));

/* 3案生成 */
const plans = S.generatePlans(ctx());
t("3案: 3件生成", plans.length === 3);
t("3案: 方向性タグが全て異なる", new Set(plans.map(p => p.direction)).size === 3);
t("3案: 全案に核・発問・活動・見取り・振り返り", plans.every(p => p.core && p.question && p.question.text && p.activities.length && p.assessment && p.reflection.length));
t("3案: 「この案のよさ」が自然文で付く", plans.every(p => p.rationale && p.rationale.fit.length > 20));
t("3案: よさ文に内部用語が出ない", plans.every(p => !p.rationale.fit.includes("思考操作") && !p.rationale.fit.includes("成果物で目標到達")));
t("3案: よさ文は2文以内", plans.every(p => (p.rationale.fit.match(/。/g) || []).length <= 2));
t("3案: よさ文が目標タイプを反映（根拠）", plans.every(p => p.rationale.fit.includes("根拠")));
t("3案: 時間内（警告制御込み）", plans.every(p => p.activities.reduce((s, a) => s + a.duration, 0) <= 50));

/* 回避条件が3案にも効く */
const plansAvoid = S.generatePlans(ctx({ avoidedElements: ["ペア活動", "グループ活動", "端末利用"] }));
t("3案: 回避条件を尊重", plansAvoid.every(p => p.activities.every(a => a.groupType.every(g => g !== "pair" && g !== "group"))));

/* 固定要素 */
const plansFix = S.generatePlans(ctx({ fixedElements: ["ペア交流を入れる", "書く活動を入れる"] }));
t("固定: ペア交流を含む", plansFix.every(p => p.activities.some(a => a.groupType.includes("pair"))));
t("固定: 書く活動を含む", plansFix.every(p => p.activities.some(a => ["short-writing", "long-writing"].includes(a.outputType))));

/* 現在の発問を固定 */
const plansQ = S.generatePlans(ctx({ fixedElements: ["現在の中心発問を残す"], currentQuestion: "メロスが最も変わった一文はどこか。" }));
t("固定: 教員の発問がそのまま残る", plansQ.every(p => p.question.text === "メロスが最も変わった一文はどこか。"));

/* ロック */
const p0 = plans[0];
const dir0 = S.DIRECTIONS.find(d => d.id === p0.dirId);
const relocked = S.buildPlan(ctx(), dir0, { question: true, core: true }, p0);
t("ロック: 発問が変化しない", relocked.question.text === p0.question.text);
t("ロック: 核が変化しない", relocked.core === p0.core);

/* 部分ガチャ */
const partial = S.generatePartial(ctx(), ["intro", "question", "supports"]);
t("部分ガチャ: 指定項目のみ", partial.fields.length === 3 && partial.data.intro && partial.data.question.text && partial.data.supports.length);

/* 困りごと */
t("困りごと: 全18項目に打ち手3つ", S.CONCERNS.every(c => S.concernSolutions(c).length === 3));

/* 学級傾向→支援 */
const cT = ctx({ classTendencies: ["考えはあるが文章化が難しい", "交流への心理的負担に配慮したい"] });
const plansT = S.generatePlans(cT);
const supIds = plansT.flatMap(p => p.supports.map(s => s.id));
t("支援: 傾向対応の支援が選ばれる", supIds.some(id => ["s-frame", "s-oral", "s-order", "s-quiet", "s-thinkfirst"].includes(id)));

/* 整合性チェック */
const warnCtx = ctx({ classTendencies: ["a","b","c","d","e","f"] });
const warnPlans = S.generatePlans(warnCtx);
t("警告: 傾向過多で警告", warnPlans.some(p => p.warnings.some(w => w.includes("複雑"))));

/* テキスト出力 */
const text = S.planToText(ctx(), plans[0]);
t("出力: 必須項目を含む", ["【学年】", "【教材】", "【本時の目標】", "【授業の中心】", "【中心発問】", "【学習活動】", "【見取り】", "【留意点】"].every(k => text.includes(k) || k === "【留意点】"));
t("出力: 内部用語が再出現しない", !text.includes("主な思考操作") && !text.includes("思考操作") && !text.includes("成果物で目標到達"));
t("出力: 見取りが自然文（〜見ます）", text.includes("見ます"));
t("警告文: 内部断定調でない", (() => { const w = S.checkPlan(ctx({classTendencies:["a","b","c","d","e","f"]}), plans[0], plans[0].activities[0]); return w.every(x => !x.includes("可能性があります")); })());
t("想定反応: 「理由づけ」を含まない", Object.values(S.EXPECTED_RESPONSES).flat().every(x => !x.includes("理由づけ")));
t("発問意図: 「〜させる。」の羅列調でない", S.QUESTIONS.every(q => q.intention.includes("ます")));
t("出力: 叩き台の但し書きを含む", text.includes("叩き台"));

/* 別ルート */
const routes = S.generatePlans(ctx(), ["交流を減らす案", "根拠を中心にする案", "時間を短縮する案"]);
t("別ルート: 指定ラベルが反映", routes.map(p => p.direction).join(",").includes("根拠中心"));

/* 統計的検証: 100回生成して破綻ゼロ */
let broken = 0;
for (let i = 0; i < 100; i++) {
  const ps = S.generatePlans(ctx({ material: S.getMaterial(["g1-007", "g2-003", "g3-006"][i % 3]), lessonStage: ["人物像", "根拠と主張", "心情・認識の変化"][i % 3], objectiveType: ["根拠を挙げる", "比較する", "解釈する"][i % 3] }));
  if (ps.length !== 3 || ps.some(p => !p.activities.length || !p.question.text)) broken++;
}
t("統計: 100回生成で破綻0件", broken === 0);

console.log(`\n結果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
