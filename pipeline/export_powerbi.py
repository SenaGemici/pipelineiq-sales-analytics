"""Power BI için yıldız şeması dışa aktarımı: data/powerbi/*.csv

Olgu tabloları (fact_*) ve boyut tabloları (dim_*) temiz veriden ve analiz çıktılarından üretilir.
Rapor kurulumu ve DAX ölçüleri için: data/powerbi/README.md ve data/powerbi/olculer.dax

Çalıştırma:  python pipeline/export_powerbi.py   (önce build_dataset.py ve analyze.py)
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analytics as a  # noqa: E402

OUT = a.ROOT / "data" / "powerbi"
ANALYSIS = a.ROOT / "data" / "analysis"
STAGE_TR = {"Prospecting": "Potansiyel", "Qualification": "Nitelendirme", "Proposal": "Teklif", "Negotiation": "Müzakere", "Won": "Kazanıldı", "Lost": "Kaybedildi"}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    clean = a.CLEAN
    deals = pd.read_csv(clean / "sales_pipeline.csv", parse_dates=["created_date", "close_date", "stage_entered_date"])
    accounts, teams, products = (pd.read_csv(clean / f"{n}.csv") for n in ["accounts", "sales_teams", "products"])
    history = a.load().history
    scores = pd.read_csv(ANALYSIS / "11_acik_firsat_skorlari.csv").rename(columns={"Unnamed: 0": "opportunity_id"})
    as_of = max(deals["close_date"].max(), history["entered_date"].max())

    # --- Boyutlar ---
    dim_company = accounts.rename(columns={"account": "company", "office_location": "city", "subsidiary_of": "parent_company"})
    dim_company.insert(0, "company_key", range(1, len(dim_company) + 1))
    dim_company = pd.concat([dim_company, pd.DataFrame([{"company_key": 0, "company": "(Şirket atanmamış)", "sector": "(Bilinmiyor)", "city": "(Bilinmiyor)"}])], ignore_index=True)
    dim_rep = teams.rename(columns={"sales_agent": "rep", "regional_office": "region"})
    dim_rep.insert(0, "rep_key", range(1, len(dim_rep) + 1))
    dim_product = products.rename(columns={"product": "product", "sales_price": "list_price"})
    dim_product.insert(0, "product_key", range(1, len(dim_product) + 1))
    dates = pd.date_range("2025-01-01", as_of + pd.Timedelta(days=a.HORIZON_DAYS), freq="D")
    months_tr = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
    dim_date = pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "year": dates.year, "quarter": "Ç" + dates.quarter.astype(str),
                             "month_number": dates.month, "month": [months_tr[m - 1] for m in dates.month],
                             "year_month": dates.strftime("%Y-%m"), "week_start": (dates - pd.to_timedelta(dates.weekday, unit="D")).strftime("%Y-%m-%d")})

    # --- Olgu: fırsat ---
    fact = deals.merge(dim_company[["company_key", "company"]], left_on="account", right_on="company", how="left")
    fact = fact.merge(dim_rep[["rep_key", "rep"]], left_on="sales_agent", right_on="rep").merge(dim_product[["product_key", "product", "list_price"]], on="product")
    fact["company_key"] = fact["company_key"].fillna(0).astype(int)
    stall = history.assign(days=(history["left_date"] - history["entered_date"]).dt.days)
    p90 = stall[stall["stage"].isin(a.OPEN_STAGES) & stall["left_date"].notna()].groupby("stage")["days"].quantile(0.9)
    is_open = ~fact["deal_stage"].isin(["Won", "Lost"])
    fact["days_in_stage"] = np.where(is_open, (as_of - fact["stage_entered_date"]).dt.days, np.nan)
    fact["is_stalled"] = is_open & (fact["days_in_stage"] > fact["deal_stage"].map(p90))
    fact["expected_amount"] = np.where(is_open, fact["list_price"] * (1 - fact["discount_pct"].fillna(0) / 100), np.nan)
    fact = fact.merge(scores[["opportunity_id", "p_model", "p_stage"]], on="opportunity_id", how="left")
    fact_opportunity = pd.DataFrame({
        "opportunity_id": fact["opportunity_id"], "company_key": fact["company_key"], "rep_key": fact["rep_key"], "product_key": fact["product_key"],
        "lead_source": fact["lead_source"].fillna("(Bilinmiyor)"), "stage": fact["deal_stage"].map(STAGE_TR), "stage_order": fact["deal_stage"].map(a.STAGE_ORDER),
        "created_date": fact["created_date"].dt.strftime("%Y-%m-%d"), "close_date": fact["close_date"].dt.strftime("%Y-%m-%d"),
        "stage_entered_date": fact["stage_entered_date"].dt.strftime("%Y-%m-%d"),
        "is_open": is_open.astype(int), "is_won": (fact["deal_stage"] == "Won").astype(int), "is_lost": (fact["deal_stage"] == "Lost").astype(int),
        "is_stalled": fact["is_stalled"].astype(int), "days_in_stage": fact["days_in_stage"],
        "cycle_days": np.where(fact["deal_stage"] == "Won", (fact["close_date"] - fact["created_date"]).dt.days, np.nan),
        "close_value": fact["close_value"], "list_price": fact["list_price"], "discount_pct": fact["discount_pct"], "expected_amount": fact["expected_amount"],
        "p_stage": fact["p_stage"], "p_model": fact["p_model"], "loss_reason": np.where(fact["deal_stage"] == "Lost", fact["loss_reason"].fillna("(Belirtilmedi)"), None),
    })

    # --- Olgu: aşama geçmişi ---
    fact_stage_history = pd.DataFrame({
        "opportunity_id": history["opportunity_id"], "stage": history["stage"].map(STAGE_TR), "stage_order": history["stage"].map(a.STAGE_ORDER),
        "entered_date": history["entered_date"].dt.strftime("%Y-%m-%d"), "left_date": history["left_date"].dt.strftime("%Y-%m-%d"),
        "days_in_stage": (history["left_date"] - history["entered_date"]).dt.days,
        "next_stage": history.groupby("opportunity_id")["stage"].shift(-1).map(STAGE_TR),
    })
    backtest = pd.read_csv(ANALYSIS / "10_geriye_donuk_test.csv")

    tables = {"fact_opportunity": fact_opportunity, "fact_stage_history": fact_stage_history, "fact_backtest": backtest,
              "dim_company": dim_company, "dim_rep": dim_rep, "dim_product": dim_product, "dim_date": dim_date}
    for name, frame in tables.items():
        frame.to_csv(OUT / f"{name}.csv", index=False, encoding="utf-8-sig")  # BOM: Power BI ve Excel Türkçe karakterleri doğru okur
        print(f"{name}: {len(frame):,} satır")


if __name__ == "__main__":
    main()
