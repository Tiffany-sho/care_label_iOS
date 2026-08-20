"use client";

import { useMemo, useState } from "react";
import CareSymbol from "./CareSymbol";
import {
  CATEGORIES,
  SYMBOL_BY_CODE,
  symbolsOf,
  type CategoryId,
} from "@/lib/symbols";
import { buildPlan, DISCLAIMER, type Level, type Selection } from "@/lib/plan";

const LEVEL_LABEL: Record<Level, string> = {
  ok: "そのまま可",
  caution: "条件つき",
  forbidden: "不可",
  unknown: "情報なし",
};

export default function Picker() {
  const [tab, setTab] = useState<CategoryId>("wash");
  const [sel, setSel] = useState<Selection>({});

  const plan = useMemo(() => buildPlan(sel), [sel]);
  const selectedCodes = CATEGORIES.map((c) => sel[c.id]).filter(
    (v): v is string => Boolean(v),
  );

  function toggle(category: CategoryId, code: string) {
    setSel((prev) => ({
      ...prev,
      // 同じ記号を再度押したら解除。1カテゴリ1記号（実際のタグと同じ制約）。
      [category]: prev[category] === code ? undefined : code,
    }));
  }

  return (
    <div className="columns">
      {/* ── 入力 ───────────────────────────── */}
      <div>
        <div className="card">
          <h2>1. タグの記号を選ぶ</h2>
          <p className="sub">
            衣類のタグに並んでいる記号を、分類ごとに1つずつ選びます。タグに無い分類は選ばないでください。
          </p>

          <div className="selected">
            {selectedCodes.length === 0 ? (
              <span className="empty">まだ何も選ばれていません</span>
            ) : (
              <>
                {selectedCodes.map((code) => {
                  const s = SYMBOL_BY_CODE[code];
                  return (
                    <button
                      key={code}
                      type="button"
                      className="pill"
                      onClick={() => toggle(s.category, code)}
                      title="クリックで解除"
                    >
                      <CareSymbol glyph={s.glyph} size={22} />
                      {s.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => setSel({})}
                >
                  すべて解除
                </button>
              </>
            )}
          </div>

          <div className="tabs" role="tablist">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === c.id}
                onClick={() => setTab(c.id)}
              >
                {c.tab}
                {sel[c.id] && <span className="dot" aria-label="選択済み" />}
              </button>
            ))}
          </div>

          <div className="grid">
            {symbolsOf(tab).map((s) => (
              <button
                key={s.code}
                type="button"
                className="chip"
                aria-pressed={sel[s.category] === s.code}
                onClick={() => toggle(s.category, s.code)}
                title={s.meaning}
              >
                <CareSymbol glyph={s.glyph} size={48} />
                <span className="label">{s.name}</span>
                <span className="code">{s.code}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 出力 ───────────────────────────── */}
      <div>
        <div className="card">
          <h2>2. 洗い方</h2>
          <p className="sub">
            記号が示すのは「上限」と「可否」です。推奨値ではありません。
          </p>

          {plan.conflicts.map((c) => (
            <div className="conflict" key={c}>
              {c}
            </div>
          ))}

          {plan.sections.map((s) => (
            <div className="section" key={s.id}>
              <div className="section-head">
                <h3>{s.title}</h3>
                <span className={`badge ${s.level}`}>{LEVEL_LABEL[s.level]}</span>
              </div>

              {s.headlines.map((h) => (
                <p className="headline" key={h}>
                  {h}
                </p>
              ))}

              {s.notes.length > 0 && (
                <ul className="notes">
                  {s.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}

              {s.basis.length > 0 && (
                <div className="basis">
                  <div className="basis-title">この指示の根拠</div>
                  {s.basis.map((b) => (
                    <div className="basis-item" key={b.code}>
                      <CareSymbol
                        glyph={SYMBOL_BY_CODE[b.code].glyph}
                        size={26}
                      />
                      <div>
                        <div>{b.meaning}</div>
                        <div className="code">
                          {b.numberUnverified
                            ? "JIS L 0001（記号番号は未確認）"
                            : `JIS L 0001 記号 ${b.code}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="disclaimer">{DISCLAIMER}</div>
        </div>
      </div>
    </div>
  );
}
