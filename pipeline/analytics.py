"""PipelineIQ analiz kütüphanesi.

pipeline/analyze.py ve notebooks/ tarafından ortak kullanılır:

- connect():          Temiz CSV'ler üzerinde DuckDB görünümleri (analysis/sql/*.sql bu görünümleri sorgular)
- snapshot():         Herhangi bir tarihte açık pipeline'ın nasıl göründüğünü aşama geçmişinden yeniden kurar
- training_rows():    Kazanma modeli için eğitim satırları (sonuçlanmış fırsatların aşama içi kontrol noktaları)
- build_model():      Lojistik regresyon (ölçekleme + one-hot + L2 düzenlileştirme)
- backtest():         Üç tahmin yöntemini geçmiş tarihlerde, o tarihte bilinen veriyle test eder

Sızıntıyı önleme ilkesi: bir tarihte yapılan tahmin, yalnızca o tarihe kadar SONUÇLANMIŞ fırsatlarla
eğitilir ve yalnızca o tarihte BİLİNEN alanları (o tarihteki aşama, aşamada geçen süre, o tarihe kadar
verilmiş indirim) kullanır.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "clean"
SQL = ROOT / "analysis" / "sql"

OPEN_STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation"]
STAGE_ORDER = {s: i for i, s in enumerate(OPEN_STAGES + ["Won", "Lost"], start=1)}
# Aşama içinde fırsatın gözlendiği günler: model "bu aşamada X gündür bekleyen fırsat" durumunu öğrenir.
CHECKPOINT_DAYS = [0, 7, 14, 30, 45, 60, 90, 120, 180, 240, 300, 365]
# Tahmin ufku: model "önümüzdeki 120 günde kazanılır mı" sorusunu cevaplar; geriye dönük test de aynı ufku kullanır.
HORIZON_DAYS = 120
CATEGORICAL = ["stage", "product", "lead_source", "region", "sales_agent", "sector"]
# "İndirim var mı" bayrağı bilerek kullanılmaz: Teklif/Müzakere aşamalarıyla neredeyse aynı bilgiyi taşır ve
# etkiyi aşama katsayılarıyla keyfi biçimde paylaşır (çoklu doğrusallık; ayrıntı: notebooks/02). Ayırt etme gücü kaybı ihmal edilebilir.
NUMERIC = ["log_days_in_stage", "log_age_days", "discount", "log_employees"]


# ---------------------------------------------------------------- veri yükleme
def connect() -> duckdb.DuckDBPyConnection:
    """Temiz CSV'leri DuckDB görünümleri olarak açar. SQL dosyaları bu görünüm adlarını kullanır."""
    con = duckdb.connect()
    for view, file in [("opportunities", "sales_pipeline"), ("stage_history", "stage_history"), ("accounts", "accounts"),
                       ("products", "products"), ("sales_teams", "sales_teams")]:
        con.execute(f"CREATE VIEW {view} AS SELECT * FROM read_csv_auto('{(CLEAN / f'{file}.csv').as_posix()}', header = true)")
    cases = " ".join(f"WHEN '{s}' THEN {i}" for s, i in STAGE_ORDER.items())
    con.execute(f"CREATE MACRO stage_order(s) AS CASE s {cases} END")
    return con


def run_sql(con: duckdb.DuckDBPyConnection, name: str) -> pd.DataFrame:
    return con.execute((SQL / name).read_text(encoding="utf-8")).df()


@dataclass
class Data:
    deals: pd.DataFrame     # fırsat + şirket + temsilci + ürün alanları
    history: pd.DataFrame   # aşama geçmişi: opportunity_id, stage, entered_date, left_date
    as_of: pd.Timestamp


def load() -> Data:
    deals = pd.read_csv(CLEAN / "sales_pipeline.csv", parse_dates=["created_date", "close_date", "stage_entered_date"])
    accounts = pd.read_csv(CLEAN / "accounts.csv")
    teams = pd.read_csv(CLEAN / "sales_teams.csv")
    products = pd.read_csv(CLEAN / "products.csv")
    deals = (deals.merge(accounts[["account", "sector", "employees"]], on="account", how="left")
                  .merge(teams[["sales_agent", "regional_office"]], on="sales_agent", how="left")
                  .merge(products[["product", "sales_price"]], on="product", how="left")
                  .rename(columns={"regional_office": "region"}))
    deals["won"] = (deals["deal_stage"] == "Won").astype(int)
    deals["resolved"] = deals["deal_stage"].isin(["Won", "Lost"])
    history = pd.read_csv(CLEAN / "stage_history.csv", parse_dates=["entered_date"])
    history["order"] = history["stage"].map(STAGE_ORDER)
    history = history.sort_values(["opportunity_id", "entered_date", "order"])
    history["left_date"] = history.groupby("opportunity_id")["entered_date"].shift(-1)
    as_of = max(deals["close_date"].max(), history["entered_date"].max())
    return Data(deals, history.drop(columns="order"), as_of)


# ---------------------------------------------------------------- özellikler
def _features(frame: pd.DataFrame, at: pd.Series, entered: pd.Series) -> pd.DataFrame:
    """Belirli bir anda (at) fırsat hakkında bilinenlerden model girdisi üretir."""
    out = pd.DataFrame(index=frame.index)
    out["stage"] = frame["stage"].values
    out["product"] = frame["product"].values
    out["lead_source"] = frame["lead_source"].fillna("Bilinmiyor").values
    out["region"] = frame["region"].fillna("Bilinmiyor").values
    out["sales_agent"] = frame["sales_agent"].values
    out["sector"] = frame["sector"].fillna("Bilinmiyor").values
    out["log_days_in_stage"] = np.log1p((at - entered).dt.days.clip(lower=0).values)
    out["log_age_days"] = np.log1p((at - frame["created_date"]).dt.days.clip(lower=0).values)
    # İndirim teklif aşamasında belirlenir: daha önceki aşamalarda henüz bilinmez.
    known = frame["stage"].isin(["Proposal", "Negotiation"]).values & frame["discount_pct"].notna().values
    out["discount"] = np.where(known, frame["discount_pct"].fillna(0).values, 0.0)
    out["log_employees"] = np.log10(frame["employees"].fillna(frame["employees"].median()).clip(lower=1).values)
    return out


def snapshot(data: Data, cutoff: pd.Timestamp) -> pd.DataFrame:
    """Cutoff tarihinde açık olan fırsatlar, o tarihteki aşamaları ve o tarihte bilinen özellikleriyle."""
    known = data.history[data.history["entered_date"] <= cutoff]
    current = known.groupby("opportunity_id").tail(1)
    current = current[current["stage"].isin(OPEN_STAGES)]
    frame = current.merge(data.deals.drop(columns=["stage_entered_date"]), on="opportunity_id", how="left")
    frame = frame.set_index("opportunity_id")
    features = _features(frame, pd.Series(cutoff, index=frame.index), frame["entered_date"])
    # Tutar o tarihte bilinene göre: liste fiyatı, teklif verildiyse indirim düşülerek.
    features["amount"] = frame["sales_price"] * (1 - features["discount"] / 100)
    features["won"] = frame["won"]
    features["close_date"] = frame["close_date"]
    features["close_value"] = frame["close_value"]
    return features


def training_rows(data: Data, cutoff: pd.Timestamp, horizon_days: int = HORIZON_DAYS) -> pd.DataFrame:
    """Eğitim satırları: fırsatların aşama içindeki kontrol noktaları, etiket = "sonraki H günde kazanıldı mı".

    Bir fırsat Teklif aşamasında 40 gün kaldıysa 0., 7., 14. ve 30. günlerde birer satır üretir;
    model böylece "aşamada uzun bekleyen fırsat" ile "yeni girmiş fırsat" arasındaki farkı öğrenir.

    Neden "eninde sonunda kazanıldı mı" değil de "H gün içinde kazanıldı mı"? Yalnızca sonuçlanmış
    fırsatlarla eğitmek sansürleme yanlılığı yaratır: CRM'de unutulmuş, hiç kapanmayan fırsatlar eğitime
    hiç girmez ve model "aylardır bekleyen fırsat kazanılmaz" bilgisini öğrenemez. H günlük pencere
    kullanınca, penceresi cutoff'tan önce tamamen gözlenmiş her kontrol noktası (açık kalan fırsatlar
    dahil) etiketlenebilir. Hedef, tahminin hedefiyle de aynı olur: önümüzdeki H günde kazanılacak gelir.
    """
    last_point = cutoff - pd.Timedelta(days=horizon_days)
    visits = data.history[data.history["stage"].isin(OPEN_STAGES) & (data.history["entered_date"] <= last_point)]
    rows = []
    for days in CHECKPOINT_DAYS:
        at = visits["entered_date"] + pd.Timedelta(days=days)
        # Kontrol noktasında hâlâ bu aşamada (çıkış yok ya da daha sonra) ve penceresi tamamen gözlenmiş.
        alive = visits[(at <= last_point) & (visits["left_date"].isna() | (at < visits["left_date"]))].copy()
        alive["at"] = at[alive.index]
        rows.append(alive)
    points = pd.concat(rows, ignore_index=True).merge(data.deals.drop(columns=["stage_entered_date"]), on="opportunity_id", how="left")
    features = _features(points, points["at"], points["entered_date"])
    features["won"] = ((points["won"] == 1) & (points["close_date"] <= points["at"] + pd.Timedelta(days=horizon_days))).astype(int).values
    features["opportunity_id"] = points["opportunity_id"].values
    features["at"] = points["at"].values
    return features


# ---------------------------------------------------------------- model
def build_model(C: float = 0.5) -> Pipeline:
    pre = ColumnTransformer([
        ("categorical", OneHotEncoder(handle_unknown="ignore", drop=None), CATEGORICAL),
        ("numeric", StandardScaler(), NUMERIC),
    ])
    return Pipeline([("pre", pre), ("model", LogisticRegression(C=C, max_iter=2000))])


def stage_rates(data: Data, cutoff: pd.Timestamp) -> dict[str, float]:
    """CRM'lerin standart yöntemi: aşamaya ulaşmış ve cutoff'a kadar sonuçlanmış fırsatların kazanılma oranı."""
    resolved = data.deals[data.deals["resolved"] & (data.deals["close_date"] <= cutoff)][["opportunity_id", "won"]]
    reached = data.history[data.history["stage"].isin(OPEN_STAGES)].merge(resolved, on="opportunity_id")
    return reached.groupby("stage")["won"].mean().to_dict()


def odds_ratios(model: Pipeline) -> pd.DataFrame:
    """Katsayıları okunabilir hale getirir. Sayısal özellikler standartlaştırıldığı için odds oranı
    '1 standart sapma artış'ın etkisidir; kategorilerde ise o kategoriye ait olmanın etkisidir."""
    rows = []
    names = model.named_steps["pre"].get_feature_names_out()
    for name, coef in zip(names, model.named_steps["model"].coef_[0]):
        kind, rest = name.split("__", 1)  # ör. "categorical__lead_source_Referans", "numeric__discount"
        if kind == "numeric":
            group, level = rest, ""
        else:
            group = next(c for c in CATEGORICAL if rest.startswith(c + "_"))
            level = rest[len(group) + 1:]
        rows.append({"group": group, "level": level, "coef": float(coef), "odds_ratio": float(np.exp(coef))})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- geriye dönük test
def backtest(data: Data, cutoffs: list[pd.Timestamp], horizon_days: int = HORIZON_DAYS) -> pd.DataFrame:
    """Her cutoff tarihinde, o gün açık olan fırsatlardan önümüzdeki `horizon_days` günde ne kadar gelir
    kazanılacağını üç yöntemle tahmin eder ve gerçekleşenle karşılaştırır.

    - naive:  tüm açık pipeline × genel tarihsel kazanma oranı
    - stage:  tutar × aşamanın tarihsel kazanma oranı (CRM'lerin standart 'ağırlıklı pipeline'ı)
    - model:  tutar × lojistik regresyon ile "H gün içinde kazanılma" olasılığı (aşamada geçen süre, kanal, ürün, temsilci, indirim...)
    """
    results = []
    for cutoff in cutoffs:
        open_now = snapshot(data, cutoff)
        resolved = data.deals[data.deals["resolved"] & (data.deals["close_date"] <= cutoff)]
        overall = resolved["won"].mean()
        rates = stage_rates(data, cutoff)
        train = training_rows(data, cutoff, horizon_days)
        model = build_model().fit(train[CATEGORICAL + NUMERIC], train["won"])
        p_model = model.predict_proba(open_now[CATEGORICAL + NUMERIC])[:, 1]
        window_end = cutoff + pd.Timedelta(days=horizon_days)
        won_in_window = (open_now["won"] == 1) & (open_now["close_date"] <= window_end)
        results.append({
            "cutoff": cutoff.strftime("%Y-%m-%d"),
            "open_deals": len(open_now),
            "pipeline": float(open_now["amount"].sum()),
            "actual": float(open_now.loc[won_in_window, "close_value"].fillna(0).sum()),
            "naive": float((open_now["amount"] * overall).sum()),
            "stage": float((open_now["amount"] * open_now["stage"].map(rates)).sum()),
            "model": float((open_now["amount"] * p_model).sum()),
        })
    return pd.DataFrame(results)
