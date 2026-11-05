"""PipelineIQ analiz katmanı.

Temiz veri üzerinde analysis/sql/*.sql sorgularını (DuckDB) çalıştırır, kazanma modelini eğitip
değerlendirir, tahmin yöntemlerini geriye dönük test eder ve bulguları üretir. Çıktılar:

- lib/generated/analysis.ts   Uygulamanın analiz ekranları
- data/analysis/*.csv          Aynı sonuçlar tablo olarak (Power BI, Excel vb.)

Çalıştırma:  python pipeline/analyze.py   (önce generate_raw.py ve build_dataset.py)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analytics as a  # noqa: E402
from build_dataset import js_module  # noqa: E402

OUT = a.ROOT / "data" / "analysis"
GENERATED = a.ROOT / "lib" / "generated"
STAGE_TR = {"Prospecting": "Potansiyel", "Qualification": "Nitelendirme", "Proposal": "Teklif", "Negotiation": "Müzakere", "Won": "Kazanıldı", "Lost": "Kaybedildi"}
# Model değerlendirmesi: bu tarihe kadar bilinen veriyle eğitilir, sonrasında gözlenen kontrol noktalarında test edilir.
EVALUATION_CUTOFF = pd.Timestamp("2026-03-01")


def records(frame: pd.DataFrame) -> list[dict]:
    """DataFrame → JSON kayıtları (NaN → null, numpy tipleri → Python tipleri)."""
    clean = frame.replace({np.nan: None})
    return [{k: (v.item() if hasattr(v, "item") else v) for k, v in row.items()} for row in clean.to_dict("records")]


def pct(value: float, digits: int = 0) -> str:
    return f"%{value * 100:.{digits}f}".replace(".", ",")


def money(value: float) -> str:
    return f"${value:,.0f}".replace(",", ".")


def evaluate_model(data: a.Data) -> dict:
    """Zamana göre ayrılmış test: model ve aşama oranı aynı test noktalarında karşılaştırılır."""
    train = a.training_rows(data, EVALUATION_CUTOFF)
    every = a.training_rows(data, data.as_of)
    test = every[every["at"] > EVALUATION_CUTOFF - pd.Timedelta(days=a.HORIZON_DAYS)]
    test = test[~test.set_index(["opportunity_id", "at"]).index.isin(train.set_index(["opportunity_id", "at"]).index)]
    model = a.build_model().fit(train[a.CATEGORICAL + a.NUMERIC], train["won"])
    p_model = model.predict_proba(test[a.CATEGORICAL + a.NUMERIC])[:, 1]
    # Kıyas: aşamaya göre "H gün içinde kazanılma" oranı (eğitim döneminden)
    p_stage = test["stage"].map(train.groupby("stage")["won"].mean()).fillna(train["won"].mean())
    bins = pd.qcut(p_model, 10, labels=False, duplicates="drop")
    calibration = (pd.DataFrame({"bin": bins, "predicted": p_model, "actual": test["won"].values})
                   .groupby("bin").agg(predicted=("predicted", "mean"), actual=("actual", "mean"), n=("actual", "size")).reset_index())
    return {
        "trainRows": len(train), "testRows": len(test), "trainEnd": EVALUATION_CUTOFF.strftime("%Y-%m-%d"),
        "auc": round(float(roc_auc_score(test["won"], p_model)), 3), "aucStage": round(float(roc_auc_score(test["won"], p_stage)), 3),
        "brier": round(float(brier_score_loss(test["won"], p_model)), 4), "brierStage": round(float(brier_score_loss(test["won"], p_stage)), 4),
        "baseRate": round(float(test["won"].mean()), 4),
        "calibration": records(calibration.round(4)),
    }


def readable_coefficients(model) -> list[dict]:
    """Odds oranlarını bir referans kategoriye göre ifade eder (ör. kanallar 'Web'e göre)."""
    table = a.odds_ratios(model)
    reference = {"stage": "Prospecting", "lead_source": "Web", "product": "Bulut Başlangıç"}
    rows = []
    for group, ref in reference.items():
        part = table[table["group"] == group].set_index("level")
        for level, row in part.iterrows():
            if level != ref:
                rows.append({"group": group, "level": STAGE_TR.get(level, level), "reference": STAGE_TR.get(ref, ref),
                             "oddsRatio": round(float(np.exp(row["coef"] - part.loc[ref, "coef"])), 3)})
    labels = {"log_days_in_stage": "Aşamada geçen süre", "log_age_days": "Fırsat yaşı", "discount": "Teklif indirimi", "log_employees": "Şirket büyüklüğü"}
    for _, row in table[table["level"] == ""].iterrows():
        rows.append({"group": "numeric", "level": labels[row["group"]], "reference": "1 standart sapma artış", "oddsRatio": round(row["odds_ratio"], 3)})
    return rows


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    data = a.load()
    con = a.connect()
    sql = {path.stem: a.run_sql(con, path.name) for path in sorted(a.SQL.glob("*.sql"))}
    for name, frame in sql.items():
        frame.to_csv(OUT / f"{name}.csv", index=False)

    # --- Model değerlendirmesi, geriye dönük test ve güncel tahmin ---
    evaluation = evaluate_model(data)
    cutoffs = list(pd.date_range("2025-10-01", data.as_of - pd.Timedelta(days=a.HORIZON_DAYS), freq="MS"))
    backtest = a.backtest(data, cutoffs)
    backtest.to_csv(OUT / "10_geriye_donuk_test.csv", index=False)
    errors = {m: {"mape": round(float(((backtest[m] - backtest["actual"]).abs() / backtest["actual"]).mean()), 4),
                  "bias": round(float(((backtest[m] - backtest["actual"]) / backtest["actual"]).mean()), 4)} for m in ["naive", "stage", "model"]}

    train_all = a.training_rows(data, data.as_of)
    final_model = a.build_model().fit(train_all[a.CATEGORICAL + a.NUMERIC], train_all["won"])
    open_now = a.snapshot(data, data.as_of)
    open_now["p_model"] = final_model.predict_proba(open_now[a.CATEGORICAL + a.NUMERIC])[:, 1]
    rates = a.stage_rates(data, data.as_of)
    open_now["p_stage"] = open_now["stage"].map(rates)
    overall = float(data.deals.loc[data.deals["resolved"], "won"].mean())
    stall = data.history.assign(days=(data.history["left_date"] - data.history["entered_date"]).dt.days)
    stall_days = stall[stall["stage"].isin(a.OPEN_STAGES) & stall["left_date"].notna()].groupby("stage")["days"].quantile(0.9)
    open_now["stalled"] = np.expm1(open_now["log_days_in_stage"]).round() > open_now["stage"].map(stall_days)
    open_now[["stage", "amount", "p_stage", "p_model", "stalled"]].round(4).to_csv(OUT / "11_acik_firsat_skorlari.csv")
    forecast = {
        "openDeals": len(open_now), "pipeline": round(float(open_now["amount"].sum())),
        "naive": round(float((open_now["amount"] * overall).sum())),
        "stage": round(float((open_now["amount"] * open_now["p_stage"]).sum())),
        "model": round(float((open_now["amount"] * open_now["p_model"]).sum())),
        "stalledDeals": int(open_now["stalled"].sum()),
        "stalledPipeline": round(float(open_now.loc[open_now["stalled"], "amount"].sum())),
        "stalledModel": round(float((open_now["amount"] * open_now["p_model"])[open_now["stalled"]].sum())),
        "avgProbabilityStalled": round(float(open_now.loc[open_now["stalled"], "p_model"].mean()), 4),
        "avgProbabilityActive": round(float(open_now.loc[~open_now["stalled"], "p_model"].mean()), 4),
    }

    # --- Bulgular: her biri hesaplanan sayılardan üretilir ---
    funnel, sources, discount, reps, losses = sql["01_huni"], sql["02_kanal_performansi"], sql["07_indirim_etkisi"], sql["06_temsilci_performansi"], sql["05_kayip_nedenleri"]
    known = sources[sources["lead_source"] != "Bilinmiyor"].set_index("lead_source")
    best, worst = known["revenue_per_deal"].idxmax(), known["revenue_per_deal"].idxmin()
    weakest = funnel.dropna(subset=["conversion_from_previous"]).sort_values("conversion_from_previous").iloc[0]
    weakest_from = funnel.loc[funnel["step"] == weakest["step"] - 1, "stage"].iloc[0]
    top_loss = losses[(losses["lost_at_stage"] == weakest_from) & (losses["reason"] != "Belirtilmedi")].head(2)
    peak = discount.loc[discount["expected_revenue_ratio"].idxmax()]
    high = discount.iloc[-1]
    peak_upper = f"%{int((peak['band_order'] + 1) * 5)}"  # zirve dilimin üst sınırı, ör. "%10-15" → "%15"
    eligible = reps[reps["deals"] >= 50].copy()
    eligible["rank_raw"] = eligible["win_rate"].rank(ascending=False, method="first").astype(int)
    eligible["rank_adjusted"] = eligible["mix_adjusted_index"].rank(ascending=False, method="first").astype(int)
    eligible["shift"] = eligible["rank_raw"] - eligible["rank_adjusted"]
    mover = eligible.loc[eligible["shift"].abs().idxmax()]
    rank_correlation = float(eligible["rank_raw"].corr(eligible["rank_adjusted"], method="spearman"))
    overall_rate = float(data.deals.loc[data.deals["resolved"], "won"].mean())
    below = eligible[eligible["ci_high"] < overall_rate]
    # Bulgu, sıralamanın gerçekten değişip değişmediğine göre yazılır; değişmiyorsa bunu açıkça söyler.
    if abs(mover["shift"]) >= 5:
        direction = "yükseliyor" if mover["shift"] > 0 else "düşüyor"
        rep_title = "Ham kazanma oranı temsilci performansını yanlış sıralıyor"
        rep_finding = (f"Ürün ve kanal karışımı hesaba katılınca {mover['sales_agent']} {abs(int(mover['shift']))} sıra {direction} "
                       f"(ham oranda {int(mover['rank_raw'])}., düzeltilmiş endekste {int(mover['rank_adjusted'])}.). "
                       f"Soğuk arama ağırlıklı çalışan temsilciler ham oranda haksız biçimde geride görünüyor.")
    else:
        rep_title = "Temsilciler arasındaki fark fırsat karışımından değil, performanstan kaynaklanıyor"
        rep_finding = f"Ürün ve kanal karışımı hesaba katıldığında sıralama neredeyse değişmiyor (sıra korelasyonu {rank_correlation:.2f})."
    rep_finding += (f" {', '.join(below['sales_agent'])}: güven aralığının üst sınırı bile şirket ortalamasının ({pct(overall_rate)}) altında."
                    if len(below) else " Hiçbir temsilci istatistiksel olarak ortalamanın altında değil.")
    stalled_share = forecast["stalledDeals"] / max(1, forecast["openDeals"])
    insights = [
        {"id": "forecast", "page": "/tahmin", "title": "Standart pipeline tahmini geliri olduğundan çok yüksek gösteriyor",
         "metric": f"{money(forecast['stage'])} → {money(forecast['model'])}",
         "finding": f"CRM'lerin standart 'aşamaya göre ağırlıklı pipeline' yöntemi önümüzdeki {a.HORIZON_DAYS} gün için {money(forecast['stage'])} öngörüyor; kazanma modeli {money(forecast['model'])}. "
                    f"Geçmiş {len(backtest)} ayda test edildiğinde standart yöntem gerçekleşeni ortalama {pct(errors['stage']['bias'])} fazla tahmin etti, modelin hatası {pct(errors['model']['mape'])} oldu.",
         "recommendation": "Gelir tahmini ve hedef planlamasında model tahmini kullanılmalı; aşama olasılıkları tek başına yeterli değil."},
        {"id": "stalled", "page": "/satis-suresi", "title": f"Açık fırsatların {pct(stalled_share)} kadarı takılmış durumda",
         "metric": f"{forecast['stalledDeals']} / {forecast['openDeals']} fırsat",
         "finding": f"{forecast['stalledDeals']} açık fırsat bulunduğu aşamada, o aşamadan çıkan fırsatların %90'ından uzun süredir bekliyor. Pipeline'da {money(forecast['stalledPipeline'])} görünüyorlar ama "
                    f"model bunların {a.HORIZON_DAYS} gün içinde kazanılma olasılığını ortalama {pct(forecast['avgProbabilityStalled'], 1)} buluyor (aktif fırsatlarda {pct(forecast['avgProbabilityActive'], 1)}).",
         "recommendation": "Takılmış fırsatlar için temsilcilere 2 haftalık süre verilmeli: ya güncellenip ilerletilmeli ya da kayıp nedeniyle kapatılmalı."},
        {"id": "channel", "page": "/huni", "title": f"{best} kanalı fırsat başına {worst} kanalının {known.loc[best, 'revenue_per_deal'] / known.loc[worst, 'revenue_per_deal']:.1f} katı gelir getiriyor".replace(".", ","),
         "metric": f"{money(known.loc[best, 'revenue_per_deal'])} / {money(known.loc[worst, 'revenue_per_deal'])}",
         "finding": f"{best} kaynaklı fırsatların kazanma oranı {pct(known.loc[best, 'win_rate'])}, {worst} kaynaklılarda {pct(known.loc[worst, 'win_rate'])}. "
                    f"{worst} fırsatları ayrıca daha yavaş kapanıyor (medyan {known.loc[worst, 'median_cycle_days']:.0f} gün, {best} için {known.loc[best, 'median_cycle_days']:.0f} gün).",
         "recommendation": f"{best} kanalını büyütecek bir program (ör. müşteri tavsiye teşviki) değerlendirilmeli; {worst} eforu daha iyi hedeflenmiş hesaplara odaklanmalı."},
        {"id": "discount", "page": "/performans", "title": f"{peak_upper} üzeri indirim kazanma şansını artırmıyor, sadece geliri düşürüyor",
         "metric": f"{pct(peak['expected_revenue_ratio'])} → {pct(high['expected_revenue_ratio'])}",
         "finding": f"Müzakereye ulaşan fırsatlarda liste fiyatının her dolarından elde edilen beklenen gelir {peak['discount_band']} indirim diliminde en yüksek ({pct(peak['expected_revenue_ratio'])}). "
                    f"Daha yüksek indirimlerde kazanma oranı artmıyor ({peak['discount_band']}: {pct(peak['win_rate'])}, {high['discount_band']}: {pct(high['win_rate'])}); "
                    f"buna karşın gerçekleşen fiyat oranı {pct(peak['realized_price_ratio'])} seviyesinden {pct(high['realized_price_ratio'])} seviyesine iniyor.",
         "recommendation": f"İndirimler için {peak_upper} üst sınır, bunun üzerindeki tekliflerde yönetici onayı getirilmeli."},
        {"id": "funnel", "page": "/huni", "title": f"Huninin en zayıf halkası: {STAGE_TR[weakest_from]} → {STAGE_TR[weakest['stage']]}",
         "metric": pct(weakest["conversion_from_previous"]),
         "finding": f"{STAGE_TR[weakest_from]} aşamasından {STAGE_TR[weakest['stage']]} aşamasına geçiş oranı yalnızca {pct(weakest['conversion_from_previous'])}; huninin en düşük geçiş oranı bu. "
                    f"Bu aşamadaki kayıpların başlıca nedenleri: " + ", ".join(f"{r.reason} ({pct(r.share_in_stage)})" for r in top_loss.itertuples()) + ".",
         "recommendation": "Teklif aşamasında rakip ve fiyat itirazlarına yönelik bir değer anlatımı (ROI hesabı, referans müşteri) hazırlanmalı."},
        {"id": "reps", "page": "/performans", "title": rep_title,
         "metric": f"{len(below)} temsilci anlamlı şekilde ortalamanın altında",
         "finding": rep_finding,
         "recommendation": "Prim ve koçluk kararları ham orana değil, karışıma göre düzeltilmiş endekse ve güven aralığına göre verilmeli; ortalamanın altında kalan temsilciler için koçluk planı yapılmalı."},
    ]

    analysis = {
        "asOf": data.as_of.strftime("%Y-%m-%d"), "horizonDays": a.HORIZON_DAYS, "overallWinRate": round(overall_rate, 4),
        "funnel": records(funnel), "sources": records(sources), "stageDurations": records(sql["03_asama_sureleri"]),
        "waitAdvance": records(sql["04_bekleme_ve_ilerleme"]), "lossReasons": records(losses), "reps": records(reps.round(4)),
        "discount": records(discount), "products": records(sql["08_urun_ve_satis_suresi"]), "monthly": records(sql["09_aylik_trend"]),
        "model": {**evaluation, "coefficients": readable_coefficients(final_model)},
        "backtest": {"rows": records(backtest.round(0)), "errors": errors},
        "forecast": forecast,
        "scores": {opp: [round(float(r.p_model), 4), round(float(r.p_stage), 4)] for opp, r in open_now.iterrows()},
        "insights": insights,
    }
    (GENERATED / "analysis.ts").write_text(js_module("Analysis", "../analysis-types", "analysis", analysis), encoding="utf-8")

    print(f"Model: AUC {evaluation['auc']} (aşama oranı {evaluation['aucStage']}), Brier {evaluation['brier']} ({evaluation['brierStage']})")
    print("Geriye dönük test:", {m: f"MAPE {pct(e['mape'], 1)}, yanlılık {pct(e['bias'], 1)}" for m, e in errors.items()})
    print("Güncel tahmin:", forecast)
    for item in insights:
        print(f"- {item['title']} | {item['metric']}")


if __name__ == "__main__":
    main()
