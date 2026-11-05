"""PipelineIQ veri hazırlama hattı.

Ham CRM dışa aktarımını (data/raw/*.csv, bkz. generate_raw.py) okur, profil çıkarır, temizler,
bütünlük kontrollerini çalıştırır ve şu çıktıları üretir:

- data/clean/*.csv              Temizlenmiş tablolar (SQL, Excel, BI araçları için)
- lib/generated/crm-data.ts     Uygulamanın başlangıç verisi
- lib/generated/data-profile.ts Veri Hazırlama ekranındaki profil ve temizlik günlüğü

Çalıştırma:  python pipeline/build_dataset.py
"""

from __future__ import annotations

import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CLEAN = ROOT / "data" / "clean"
GENERATED = ROOT / "lib" / "generated"

STAGES = ["Prospecting", "Engaging", "Won", "Lost"]
# Prospecting aşaması için kaynakta dönüşüm bilgisi yok; açıkça belirtilen varsayım.
PROSPECTING_PROBABILITY = 20
# Kısaltma → tam ad. Benzerlik eşleştirmesiyle yakalanamayacak kadar kısa yazımlar için.
CITY_ALIASES = {"ist": "istanbul"}
LEGAL_SUFFIXES = re.compile(r"\b(a\s?s|ltd|sti|ltd\s?sti|holding a\s?s)\b")

steps: list[dict] = []
checks: list[dict] = []


def step(table: str, column: str, kind: str, title: str, detail: str, rows: int) -> None:
    """kind: fix (düzeltildi), flag (işaretlendi), derive (türetildi), note (bilgi)."""
    steps.append({"table": table, "column": column, "kind": kind, "title": title, "detail": detail, "rows": int(rows)})


def check(name: str, detail: str, failing: int, total: int) -> None:
    checks.append({"name": name, "detail": detail, "failing": int(failing), "total": int(total)})


def profile(df: pd.DataFrame) -> list[dict]:
    return [{"name": col, "nulls": int(df[col].isna().sum()), "distinct": int(df[col].nunique(dropna=True))} for col in df.columns]


def fold(value: str) -> str:
    """Karşılaştırma anahtarı: Türkçe karakterler, büyük/küçük harf ve noktalama farkı yok sayılır."""
    value = value.replace("İ", "i").replace("I", "ı").lower()
    value = value.translate(str.maketrans("ıışğüöç", "iisguoc"))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def compact(value: str) -> str:
    return fold(value).replace(" ", "")


def canonicalize(series: pd.Series, table: str, column: str, label: str, aliases: dict[str, str] | None = None) -> pd.Series:
    """Yazım farklarını en sık kullanılan yazıma birleştirir; yazım hatalarını benzerlikle eşleştirir."""
    keys = series.dropna().map(fold)
    counts = series.dropna().groupby(keys).agg(lambda s: s.value_counts().index[0])  # anahtar → en sık yazım
    frequency = keys.value_counts()
    mapping: dict[str, str] = {}
    # Sık kullanılandan seyreğe: bir yazım, kendisinden daha sık kullanılan çok benzer bir yazım varsa ona bağlanır
    # ("teknolji" 3 kez, "teknoloji" 8 kez → teknoloji).
    for key in frequency.index:
        target = aliases.get(key, key) if aliases else key
        more_common = [k for k in frequency.index if frequency[k] > frequency.get(target, 0)]
        match = difflib.get_close_matches(target, more_common, n=1, cutoff=0.85)
        target = match[0] if match else target
        # Hedef daha sık olduğu için önce işlenmiştir; onun da bağlandığı yazım kullanılır (zincirleme eşleşme).
        mapping[key] = mapping.get(target, counts[key])
    fixed = series.map(lambda v: mapping[fold(v)] if isinstance(v, str) else v)
    changes = pd.DataFrame({"from": series, "to": fixed})[series != fixed].dropna()
    for (before, after), group in changes.groupby(["from", "to"]):
        step(table, column, "fix", f"{label} yazımı birleştirildi", f'"{before}" → "{after}"', len(group))
    return fixed


def parse_dates(series: pd.Series) -> tuple[pd.Series, int]:
    iso = pd.to_datetime(series, format="%Y-%m-%d", errors="coerce")
    dotted = pd.to_datetime(series, format="%d.%m.%Y", errors="coerce")
    return iso.fillna(dotted), int((iso.isna() & dotted.notna()).sum())


def js_module(type_name: str, type_import: str, export: str, payload: dict) -> str:
    # JSON.parse ile gömülü veri, büyük nesne literal'lerinden daha hızlı ayrıştırılır ve TypeScript'i yavaşlatmaz.
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # Tek tırnaklı JS dizesi: ters eğik çizgi ve tek tırnak kaçışlanır.
    literal = "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"
    return (
        "// Bu dosya pipeline/build_dataset.py tarafından üretilir. Elle düzenlemeyin.\n"
        f'import type {{ {type_name} }} from "{type_import}";\n\n'
        f"export const {export}: {type_name} = JSON.parse({literal});\n"
    )


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    raw = {name: pd.read_csv(RAW / f"{name}.csv", dtype=str) for name in ["accounts", "products", "sales_teams", "sales_pipeline"]}
    raw_profile = {name: profile(df) for name, df in raw.items()}
    accounts, products, teams, pipeline = (raw[n].copy() for n in ["accounts", "products", "sales_teams", "sales_pipeline"])

    # 1) Metin alanları: baştaki/sondaki ve tekrarlanan boşluklar.
    for name, df in [("accounts", accounts), ("products", products), ("sales_teams", teams), ("sales_pipeline", pipeline)]:
        for col in df.columns:
            cleaned = df[col].str.strip().str.replace(r"\s{2,}", " ", regex=True)
            changed = int((df[col].notna() & (cleaned != df[col])).sum())
            if changed:
                step(name, col, "fix", "Fazla boşluklar temizlendi", f"{changed} değerde baştaki/sondaki veya tekrarlanan boşluk kaldırıldı.", changed)
            df[col] = cleaned

    # 2) Dışa aktarımda iki kez yazılmış satırlar.
    duplicated = pipeline.duplicated()
    if duplicated.any():
        step("sales_pipeline", "*", "fix", "Tekrarlanan satırlar silindi", "Tüm alanları aynı olan satırlar dışa aktarım hatası kabul edilip tek kayda indirildi.", duplicated.sum())
        pipeline = pipeline[~duplicated].reset_index(drop=True)

    # 3) Tarihler: ISO ve GG.AA.YYYY biçimleri birlikte okunur.
    unparsed = 0
    for col in ["engage_date", "close_date"]:
        parsed, converted = parse_dates(pipeline[col])
        unparsed += int((pipeline[col].notna() & parsed.isna()).sum())
        pipeline[col] = parsed
        if converted:
            step("sales_pipeline", col, "fix", "Tarih biçimi standartlaştırıldı", "GG.AA.YYYY biçimindeki tarihler YYYY-AA-GG biçimine çevrildi.", converted)

    # 4) Temsilci ve ürün adları: ana tablolarla büyük/küçük harf ve boşluk farkı yok sayılarak eşleştirilir.
    for col, master, master_col, label in [("sales_agent", teams, "sales_agent", "Temsilci"), ("product", products, "product", "Ürün")]:
        catalog = {compact(v): v for v in master[master_col]}
        unmatched = ~pipeline[col].isin(master[master_col])
        variants = pipeline.loc[unmatched, col].nunique()
        pipeline.loc[unmatched, col] = pipeline.loc[unmatched, col].map(lambda v: catalog.get(compact(v), v))
        if unmatched.any():
            step("sales_pipeline", col, "fix", f"{label} adı ana tabloyla eşleştirildi",
                 f"{variants} farklı hatalı yazım (ör. büyük/küçük harf, bitişik yazım) ana tablodaki ada bağlandı.", unmatched.sum())

    # 5) Sektör ve şehir yazım farkları.
    accounts["sector"] = canonicalize(accounts["sector"], "accounts", "sector", "Sektör")
    accounts["office_location"] = canonicalize(accounts["office_location"], "accounts", "office_location", "Şehir", CITY_ALIASES)

    # 6) Mükerrer şirketler: hukuki ek (A.Ş., Ltd. Şti.), harf ve noktalama farkı yok sayılarak bulunur ve birleştirilir.
    accounts["_key"] = accounts["account"].map(lambda v: re.sub(r"\s+", " ", LEGAL_SUFFIXES.sub("", fold(v))).strip())
    accounts["_filled"] = accounts.notna().sum(axis=1) - (accounts["account"].str.upper() == accounts["account"]).astype(int)
    rename: dict[str, str] = {}
    merged = []
    for _, group in accounts.groupby("_key"):
        group = group.sort_values("_filled", ascending=False)
        keep = group.iloc[0].copy()
        for _, other in group.iloc[1:].iterrows():
            keep = keep.fillna(other)  # eksik alanlar kopyadan tamamlanır
            rename[other["account"]] = keep["account"]
        merged.append(keep)
    if rename:
        moved = pipeline["account"].isin(rename).sum()
        pipeline["account"] = pipeline["account"].replace(rename)
        step("accounts", "account", "fix", "Mükerrer şirketler birleştirildi",
             "; ".join(f'"{a}" → "{b}"' for a, b in rename.items()) + f". Kopyaya bağlı {moved} fırsat asıl kayda taşındı.", len(rename))
    accounts = pd.DataFrame(merged).drop(columns=["_key", "_filled"])
    accounts["subsidiary_of"] = accounts["subsidiary_of"].replace(rename)

    # 7) Tarih sırası: kapanışı görüşmeden önce görünen kayıtlar.
    reversed_dates = pipeline["close_date"] < pipeline["engage_date"]
    if reversed_dates.any():
        pipeline.loc[reversed_dates, "engage_date"] = pd.NaT
        step("sales_pipeline", "engage_date", "flag", "Görüşme tarihi kapanıştan sonra",
             "Kapanış tarihi görüşme tarihinden önce. Hangi tarihin yanlış olduğu bilinemediği için görüşme tarihi boşaltıldı; kayıtlar Veri Kalitesi ekranında 'görüşme tarihi eksik' olarak görünür.",
             reversed_dates.sum())

    # 8) Tutarlar ve referans bütünlüğü.
    pipeline["close_value"] = pd.to_numeric(pipeline["close_value"], errors="coerce")
    for frame, cols in [(accounts, ["year_established", "revenue", "employees"]), (products, ["sales_price"])]:
        for col in cols:
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
    won_missing = (pipeline["deal_stage"] == "Won") & pipeline["close_value"].isna()
    step("sales_pipeline", "close_value", "flag", "Kazanılan fırsatta tutar yok",
         "Gerçekleşen tutar uydurulamaz; kayıtlar Veri Kalitesi ekranında kritik olarak işaretlenir ve gelir toplamlarına 0 olarak girer.", won_missing.sum())
    missing_account = pipeline["account"].isna()
    by_stage = pipeline.loc[missing_account, "deal_stage"].value_counts().to_dict()
    step("sales_pipeline", "account", "flag", "Şirketi olmayan fırsatlar",
         "Şirket otomatik çıkarılamaz; kayıtlar Veri Kalitesi ekranında kritik olarak işaretlenir. Aşama dağılımı: "
         + ", ".join(f"{k} {v}" for k, v in by_stage.items()) + ".", missing_account.sum())

    closed = pipeline["deal_stage"].isin(["Won", "Lost"])
    total = len(pipeline)
    check("Fırsat kimlikleri tekil", "opportunity_id tekrar etmemeli.", pipeline["opportunity_id"].duplicated().sum(), total)
    check("Geçerli aşama", f"deal_stage yalnızca {', '.join(STAGES)} olabilir.", (~pipeline["deal_stage"].isin(STAGES)).sum(), total)
    check("Tarihler okunabilir", "Dolu tarih alanları ISO veya GG.AA.YYYY olarak okunabilmeli.", unparsed, total)
    check("Kapanan fırsatın kapanış tarihi var", "Won/Lost kayıtlarında close_date dolu olmalı.", (closed & pipeline["close_date"].isna()).sum(), int(closed.sum()))
    check("Açık fırsatta kapanış tarihi yok", "Prospecting/Engaging kayıtlarında close_date boş olmalı.", (~closed & pipeline["close_date"].notna()).sum(), int((~closed).sum()))
    check("Kapanış, görüşme tarihinden önce değil", "close_date ≥ engage_date olmalı (temizlik sonrası).", (pipeline["close_date"] < pipeline["engage_date"]).sum(), int(closed.sum()))
    check("Fırsat → şirket", "Her fırsat bir şirkete bağlı olmalı.", missing_account.sum(), total)
    check("Fırsat → ürün", "Ürün adı katalogda bulunmalı.", (~pipeline["product"].isin(products["product"])).sum(), total)
    check("Fırsat → temsilci", "Temsilci satış ekibi tablosunda bulunmalı.", (~pipeline["sales_agent"].isin(teams["sales_agent"])).sum(), total)
    check("Fırsat → kayıtlı şirket", "Dolu şirket adı şirket tablosunda bulunmalı.", (pipeline["account"].notna() & ~pipeline["account"].isin(accounts["account"])).sum(), int(pipeline["account"].notna().sum()))
    check("Şirket → ana şirket", "subsidiary_of mevcut bir şirketi göstermeli.", (accounts["subsidiary_of"].notna() & ~accounts["subsidiary_of"].isin(accounts["account"])).sum(), int(accounts["subsidiary_of"].notna().sum()))
    check("Şirket adları tekil", "Hukuki ek, harf ve noktalama farkı yok sayılarak.", accounts["account"].map(compact).duplicated().sum(), len(accounts))
    prospecting = pipeline["deal_stage"] == "Prospecting"
    step("sales_pipeline", "engage_date", "note", "Potansiyel kayıtlarında tarih yok",
         "Görüşme henüz başlamadığı için engage_date boş; bu bir hata değil, aşamanın doğası. Bu kayıtlar dönem filtrelerinde yalnızca 'Tüm dönem' içinde görünür.", prospecting.sum())
    idle = sorted(set(teams["sales_agent"]) - set(pipeline["sales_agent"]))
    if idle:
        step("sales_teams", "sales_agent", "note", "Fırsatı olmayan temsilciler", "Ekipte var ama hiç fırsatı yok (yeni işe alım): " + ", ".join(idle) + ".", len(idle))
    step("sales_pipeline", "close_value", "derive", "Açık fırsat tutarları tahmin edildi",
         "Açık fırsatlarda close_value boş. Pipeline tutarı ürünün liste fiyatıyla (products.sales_price) tahmin edilir ve arayüzde '≈' ile gösterilir.", (~closed).sum())

    # 9) Türetilen metrikler.
    as_of = max(pipeline["close_date"].max(), pipeline["engage_date"].max())
    won = pipeline[(pipeline["deal_stage"] == "Won") & pipeline["engage_date"].notna()]
    cycle = (won["close_date"] - won["engage_date"]).dt.days
    win_rate = int((pipeline["deal_stage"] == "Won").sum()) / int(closed.sum())
    stall_days = int(cycle.quantile(0.9))
    engaging = pipeline[pipeline["deal_stage"] == "Engaging"]
    engaging_age = (as_of - engaging["engage_date"]).dt.days
    stalled = int((engaging_age > stall_days).sum())
    step("sales_pipeline", "engage_date", "derive", "Takılmış fırsat eşiği belirlendi",
         f"Kazanılan fırsatların %90'ı {stall_days} gün içinde kapanmış. Bu süreyi aşan görüşmedeki fırsatlar 'takılmış' sayılır: {stalled} / {len(engaging)} kayıt.", stalled)
    step("sales_pipeline", "deal_stage", "derive", "Aşama olasılıkları belirlendi",
         f"Görüşmedeki fırsatlar için tarihsel kazanma oranı %{win_rate * 100:.1f} kullanıldı. Potansiyel aşaması için kaynakta dönüşüm verisi olmadığından %{PROSPECTING_PROBABILITY} varsayıldı.", 0)

    # --- Çıktılar ---
    CLEAN.mkdir(parents=True, exist_ok=True)
    GENERATED.mkdir(parents=True, exist_ok=True)
    accounts = accounts.sort_values("account").reset_index(drop=True)
    teams = teams.sort_values("sales_agent").reset_index(drop=True)
    accounts.to_csv(CLEAN / "accounts.csv", index=False)
    products.to_csv(CLEAN / "products.csv", index=False)
    teams.to_csv(CLEAN / "sales_teams.csv", index=False)
    out = pipeline.copy()
    for col in ["engage_date", "close_date"]:
        out[col] = out[col].dt.strftime("%Y-%m-%d")
    out.to_csv(CLEAN / "sales_pipeline.csv", index=False)

    company_index = {name: i for i, name in enumerate(accounts["account"])}
    rep_index = {name: i for i, name in enumerate(teams["sales_agent"])}
    product_index = {name: i for i, name in enumerate(products["product"])}

    def date(value) -> str | None:
        return None if pd.isna(value) else value.strftime("%Y-%m-%d")

    def number(value) -> float | int | None:
        if pd.isna(value):
            return None
        return int(value) if float(value).is_integer() else round(float(value), 2)

    dataset = {
        "meta": {
            "asOf": as_of.strftime("%Y-%m-%d"), "stallDays": stall_days, "winRate": round(win_rate, 4),
            "defaultProbability": {"Prospecting": PROSPECTING_PROBABILITY, "Engaging": round(win_rate * 100), "Won": 100, "Lost": 0},
        },
        "companies": [{
            "id": f"acc-{i + 1:03d}", "name": r.account, "sector": r.sector,
            "yearEstablished": number(r.year_established), "revenue": number(r.revenue), "employees": number(r.employees),
            "city": r.office_location, "parentId": None if pd.isna(r.subsidiary_of) else f"acc-{company_index[r.subsidiary_of] + 1:03d}",
        } for i, r in enumerate(accounts.itertuples())],
        "representatives": [{"id": f"rep-{i + 1:02d}", "name": r.sales_agent, "manager": r.manager, "region": r.regional_office} for i, r in enumerate(teams.itertuples())],
        "products": [{"id": f"prd-{i + 1}", "name": r.product, "series": r.series, "price": number(r.sales_price)} for i, r in enumerate(products.itertuples())],
        # Boyutu küçültmek için ilişkiler dizi sırasıyla kodlanır (-1 = şirket yok):
        # [id, şirket sırası, ürün sırası, temsilci sırası, aşama sırası, tutar, görüşme tarihi, kapanış tarihi]
        "opportunities": [[
            r.opportunity_id, -1 if pd.isna(r.account) else company_index[r.account], product_index[r.product], rep_index[r.sales_agent],
            STAGES.index(r.deal_stage), None if r.deal_stage in ("Prospecting", "Engaging") else number(r.close_value),
            date(r.engage_date), date(r.close_date),
        ] for r in pipeline.sort_values("opportunity_id").itertuples()],
    }
    data_profile = {
        "asOf": dataset["meta"]["asOf"],
        "tables": [{"name": name, "rawRows": len(raw[name]), "cleanRows": len(df), "columns": raw_profile[name]}
                   for name, df in [("accounts", accounts), ("products", products), ("sales_teams", teams), ("sales_pipeline", pipeline)]],
        "steps": steps,
        "checks": checks,
        "metrics": {
            "winRate": round(win_rate, 4), "cycleMedian": int(cycle.median()), "cycleP90": stall_days,
            "engagingAgeMedian": int(engaging_age.median()), "stalled": stalled, "engaging": len(engaging),
            "openMissingAccount": int((missing_account & ~closed).sum()), "open": int((~closed).sum()),
            "dateRange": [pipeline["engage_date"].min().strftime("%Y-%m-%d"), dataset["meta"]["asOf"]],
        },
    }
    # Veri sürümü: içerik değişirse tarayıcıda saklanan eski değişiklikler yeni veriye karıştırılmaz.
    dataset["meta"]["version"] = hashlib.sha256(json.dumps(dataset, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    (GENERATED / "crm-data.ts").write_text(js_module("GeneratedDataset", "../dataset-types", "dataset", dataset), encoding="utf-8")
    (GENERATED / "data-profile.ts").write_text(js_module("DataProfile", "../dataset-types", "dataProfile", data_profile), encoding="utf-8")

    print(f"{len(dataset['opportunities'])} fırsat, {len(dataset['companies'])} şirket, {len(dataset['representatives'])} temsilci, {len(dataset['products'])} ürün")
    print(f"Analiz tarihi {dataset['meta']['asOf']} · kazanma oranı %{win_rate * 100:.2f} · takılmış eşiği {stall_days} gün")
    for s in steps:
        print(f"  [{s['kind']}] {s['table']}.{s['column']}: {s['title']} ({s['rows']}) {s['detail'][:90] if s['kind'] == 'fix' and s['rows'] < 20 else ''}")
    for c in checks:
        print(f"  [{'OK ' if c['failing'] == 0 else 'BAD'}] {c['name']}: {c['failing']}/{c['total']}")


if __name__ == "__main__":
    main()
