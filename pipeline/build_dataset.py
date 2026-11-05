"""PipelineIQ veri hazırlama hattı.

Ham CRM dışa aktarımını (data/raw/*.csv, bkz. generate_raw.py) okur, profil çıkarır, temizler,
bütünlük kontrollerini çalıştırır ve şu çıktıları üretir:

- data/clean/*.csv              Temizlenmiş tablolar (SQL, Power BI, notebook'lar için)
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

STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Won", "Lost"]
OPEN_STAGES = STAGES[:4]
# Kısaltma/çeviri → standart ad. Benzerlik eşleştirmesiyle yakalanamayacak yazımlar için.
CITY_ALIASES = {"ist": "istanbul"}
SOURCE_ALIASES = {"referral": "referans", "web sitesi": "web"}
LEGAL_SUFFIXES = re.compile(r"\b(a\s?s|ltd|sti|ltd\s?sti)\b")

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
    def preferred(spellings: pd.Series) -> str:
        # Anahtar → en sık yazım. Eşitlikte Türkçe karakter içeren ve harf büyüklüğü düzgün olan yazım seçilir
        # ("Eskişehir" > "Eskisehir" > "ESKİŞEHİR").
        counts = spellings.value_counts()
        return max(counts.index, key=lambda v: (counts[v], any(ch in v for ch in "çğıöşüÇĞİÖŞÜ"), not v.isupper() and not v.islower()))
    counts = series.dropna().groupby(keys).agg(preferred)
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
        mapping[key] = mapping.get(target, counts.get(target, counts[key]))
    fixed = series.map(lambda v: mapping[fold(v)] if isinstance(v, str) else v)
    changes = pd.DataFrame({"from": series, "to": fixed})[series != fixed].dropna()
    for (before, after), group in changes.groupby(["from", "to"]):
        step(table, column, "fix", f"{label} yazımı birleştirildi", f'"{before}" → "{after}"', len(group))
    return fixed


def parse_dates(series: pd.Series) -> tuple[pd.Series, int, int]:
    iso = pd.to_datetime(series, format="%Y-%m-%d", errors="coerce")
    dotted = pd.to_datetime(series, format="%d.%m.%Y", errors="coerce")
    parsed = iso.fillna(dotted)
    return parsed, int((iso.isna() & dotted.notna()).sum()), int((series.notna() & parsed.isna()).sum())


def js_module(type_name: str, type_import: str, export: str, payload: dict) -> str:
    # JSON.parse ile gömülü veri, büyük nesne literal'lerinden daha hızlı ayrıştırılır ve TypeScript'i yavaşlatmaz.
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # Tek tırnaklı JS dizesi: ters eğik çizgi ve tek tırnak kaçışlanır.
    literal = "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"
    return (
        "// Bu dosya pipeline/ altındaki betikler tarafından üretilir. Elle düzenlemeyin.\n"
        f'import type {{ {type_name} }} from "{type_import}";\n\n'
        f"export const {export}: {type_name} = JSON.parse({literal});\n"
    )


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    names = ["accounts", "products", "sales_teams", "sales_pipeline", "stage_history"]
    raw = {name: pd.read_csv(RAW / f"{name}.csv", dtype=str) for name in names}
    raw_profile = {name: profile(df) for name, df in raw.items()}
    accounts, products, teams, pipeline, history = (raw[n].copy() for n in names)

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
    for col in ["created_date", "close_date"]:
        pipeline[col], converted, bad = parse_dates(pipeline[col])
        unparsed += bad
        if converted:
            step("sales_pipeline", col, "fix", "Tarih biçimi standartlaştırıldı", "GG.AA.YYYY biçimindeki tarihler YYYY-AA-GG biçimine çevrildi.", converted)
    history["entered_date"], _, bad = parse_dates(history["entered_date"])
    unparsed += bad

    # 4) İndirim: "%12,5", "12,5" gibi yazımlar sayıya çevrilir.
    discount_text = pipeline["discount_pct"]
    normalized = discount_text.str.replace("%", "", regex=False).str.replace(",", ".", regex=False)
    reformatted = int((discount_text.notna() & (normalized != discount_text)).sum())
    pipeline["discount_pct"] = pd.to_numeric(normalized, errors="coerce")
    if reformatted:
        step("sales_pipeline", "discount_pct", "fix", "İndirim biçimi standartlaştırıldı", '"%12,5" ve "12,5" gibi yazımlar 12.5 sayısına çevrildi.', reformatted)

    # 5) Temsilci ve ürün adları: ana tablolarla büyük/küçük harf ve boşluk farkı yok sayılarak eşleştirilir.
    for col, master, master_col, label in [("sales_agent", teams, "sales_agent", "Temsilci"), ("product", products, "product", "Ürün")]:
        catalog = {compact(v): v for v in master[master_col]}
        unmatched = ~pipeline[col].isin(master[master_col])
        variants = pipeline.loc[unmatched, col].nunique()
        pipeline.loc[unmatched, col] = pipeline.loc[unmatched, col].map(lambda v: catalog.get(compact(v), v))
        if unmatched.any():
            step("sales_pipeline", col, "fix", f"{label} adı ana tabloyla eşleştirildi",
                 f"{variants} farklı hatalı yazım (ör. büyük/küçük harf, bitişik yazım) ana tablodaki ada bağlandı.", unmatched.sum())

    # 6) Kategorik yazım farkları: kaynak kanal, sektör, şehir.
    pipeline["lead_source"] = canonicalize(pipeline["lead_source"], "sales_pipeline", "lead_source", "Kaynak kanal", SOURCE_ALIASES)
    accounts["sector"] = canonicalize(accounts["sector"], "accounts", "sector", "Sektör")
    accounts["office_location"] = canonicalize(accounts["office_location"], "accounts", "office_location", "Şehir", CITY_ALIASES)

    # 7) Mükerrer şirketler: hukuki ek (A.Ş., Ltd. Şti.), harf ve noktalama farkı yok sayılarak bulunur ve birleştirilir.
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

    # 8) Oluşturulma tarihi kapanıştan sonra görünen kayıtlar: doğru tarih aşama geçmişindeki ilk kayıttan geri kazanılır.
    first_entry = history.groupby("opportunity_id")["entered_date"].min()
    reversed_dates = pipeline["close_date"] < pipeline["created_date"]
    if reversed_dates.any():
        pipeline.loc[reversed_dates, "created_date"] = pipeline.loc[reversed_dates, "opportunity_id"].map(first_entry)
        step("sales_pipeline", "created_date", "fix", "Hatalı oluşturulma tarihi aşama geçmişinden düzeltildi",
             "Oluşturulma tarihi kapanıştan sonra görünüyordu. Aşama geçmişindeki ilk kayıt (Potansiyel aşamasına giriş) doğru tarih olarak kullanıldı.",
             reversed_dates.sum())

    # 9) Sayısal alanlar ve işaretlenen eksikler.
    pipeline["close_value"] = pd.to_numeric(pipeline["close_value"], errors="coerce")
    for frame, cols in [(accounts, ["year_established", "revenue", "employees"]), (products, ["sales_price"])]:
        for col in cols:
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
    closed = pipeline["deal_stage"].isin(["Won", "Lost"])
    won_missing = (pipeline["deal_stage"] == "Won") & pipeline["close_value"].isna()
    step("sales_pipeline", "close_value", "flag", "Kazanılan fırsatta tutar yok",
         "Gerçekleşen tutar uydurulamaz; kayıtlar Veri Kalitesi ekranında kritik olarak işaretlenir ve gelir toplamlarına 0 olarak girer.", won_missing.sum())
    missing_account = pipeline["account"].isna()
    by_stage = pipeline.loc[missing_account, "deal_stage"].value_counts().to_dict()
    step("sales_pipeline", "account", "flag", "Şirketi olmayan fırsatlar",
         "Şirket otomatik çıkarılamaz; kayıtlar Veri Kalitesi ekranında kritik olarak işaretlenir. Aşama dağılımı: "
         + ", ".join(f"{k} {v}" for k, v in by_stage.items()) + ".", missing_account.sum())
    step("sales_pipeline", "lead_source", "flag", "Kaynak kanalı boş",
         "Kanal analizlerinde 'Bilinmiyor' grubunda gösterilir ve Veri Kalitesi ekranında uyarı olarak işaretlenir.", pipeline["lead_source"].isna().sum())
    lost_no_reason = (pipeline["deal_stage"] == "Lost") & pipeline["loss_reason"].isna()
    step("sales_pipeline", "loss_reason", "flag", "Kayıp nedeni girilmemiş",
         "Kayıp analizlerinde eksik kalır; Veri Kalitesi ekranında uyarı olarak işaretlenir.", lost_no_reason.sum())

    # 10) Aşama geçmişi: her fırsatın şu anki aşamaya giriş tarihi.
    history = history.sort_values(["opportunity_id", "entered_date"])
    last = history.groupby("opportunity_id").tail(1).set_index("opportunity_id")
    pipeline["stage_entered_date"] = pipeline["opportunity_id"].map(last["entered_date"])

    total = len(pipeline)
    check("Fırsat kimlikleri tekil", "opportunity_id tekrar etmemeli.", pipeline["opportunity_id"].duplicated().sum(), total)
    check("Geçerli aşama", f"deal_stage yalnızca {', '.join(STAGES)} olabilir.", (~pipeline["deal_stage"].isin(STAGES)).sum(), total)
    check("Tarihler okunabilir", "Dolu tarih alanları ISO veya GG.AA.YYYY olarak okunabilmeli.", unparsed, total)
    check("Kapanan fırsatın kapanış tarihi var", "Won/Lost kayıtlarında close_date dolu olmalı.", (closed & pipeline["close_date"].isna()).sum(), int(closed.sum()))
    check("Açık fırsatta kapanış tarihi yok", "Açık aşamalarda close_date boş olmalı.", (~closed & pipeline["close_date"].notna()).sum(), int((~closed).sum()))
    check("Kapanış, oluşturmadan önce değil", "close_date ≥ created_date olmalı (temizlik sonrası).", (pipeline["close_date"] < pipeline["created_date"]).sum(), int(closed.sum()))
    check("Aşama geçmişi güncel aşamayla tutarlı", "Geçmişteki son aşama, fırsatın şu anki aşamasıyla aynı olmalı.",
          (pipeline["opportunity_id"].map(last["stage"]) != pipeline["deal_stage"]).sum(), total)
    check("Aşama geçmişi → fırsat", "Geçmişteki her kayıt mevcut bir fırsata ait olmalı.", (~history["opportunity_id"].isin(pipeline["opportunity_id"])).sum(), len(history))
    check("Fırsat → şirket", "Her fırsat bir şirkete bağlı olmalı.", missing_account.sum(), total)
    check("Fırsat → ürün", "Ürün adı katalogda bulunmalı.", (~pipeline["product"].isin(products["product"])).sum(), total)
    check("Fırsat → temsilci", "Temsilci satış ekibi tablosunda bulunmalı.", (~pipeline["sales_agent"].isin(teams["sales_agent"])).sum(), total)
    check("Fırsat → kayıtlı şirket", "Dolu şirket adı şirket tablosunda bulunmalı.", (pipeline["account"].notna() & ~pipeline["account"].isin(accounts["account"])).sum(), int(pipeline["account"].notna().sum()))
    check("Şirket → ana şirket", "subsidiary_of mevcut bir şirketi göstermeli.", (accounts["subsidiary_of"].notna() & ~accounts["subsidiary_of"].isin(accounts["account"])).sum(), int(accounts["subsidiary_of"].notna().sum()))
    check("Şirket adları tekil", "Hukuki ek, harf ve noktalama farkı yok sayılarak.", accounts["account"].map(compact).duplicated().sum(), len(accounts))
    idle = sorted(set(teams["sales_agent"]) - set(pipeline["sales_agent"]))
    if idle:
        step("sales_teams", "sales_agent", "note", "Fırsatı olmayan temsilciler", "Ekipte var ama hiç fırsatı yok (yeni işe alım): " + ", ".join(idle) + ".", len(idle))
    step("sales_pipeline", "close_value", "derive", "Açık fırsat tutarları tahmin edildi",
         "Açık fırsatlarda close_value boş. Pipeline tutarı ürünün liste fiyatından, varsa teklifteki indirim düşülerek tahmin edilir ve arayüzde '≈' ile gösterilir.", (~closed).sum())

    # 11) Türetilen metrikler: aşamaya göre kazanma olasılığı ve takılma eşikleri.
    as_of = max(pipeline["close_date"].max(), history["entered_date"].max())
    reached = history.merge(pipeline[["opportunity_id", "deal_stage"]], on="opportunity_id")
    resolved = reached[reached["deal_stage"].isin(["Won", "Lost"])]
    probability = {stage: round(float((resolved.loc[resolved["stage"] == stage, "deal_stage"] == "Won").mean()) * 100) for stage in OPEN_STAGES}
    probability.update({"Won": 100, "Lost": 0})
    history["left_date"] = history.groupby("opportunity_id")["entered_date"].shift(-1)
    durations = (history["left_date"] - history["entered_date"]).dt.days
    stall_days = {stage: int(durations[(history["stage"] == stage) & history["left_date"].notna()].quantile(0.9)) for stage in OPEN_STAGES}
    open_deals = pipeline[~closed]
    age_in_stage = (as_of - open_deals["stage_entered_date"]).dt.days
    stalled = int(sum((age_in_stage > open_deals["deal_stage"].map(stall_days)).fillna(False)))
    win_rate = int((pipeline["deal_stage"] == "Won").sum()) / int(closed.sum())
    step("stage_history", "entered_date", "derive", "Aşamaya göre takılma eşikleri belirlendi",
         "Her aşamada, o aşamadan çıkan fırsatların %90'ının kaldığı süre: " + ", ".join(f"{s} {d} gün" for s, d in stall_days.items())
         + f". Bu süreyi aşan açık fırsatlar 'takılmış' sayılır: {stalled} / {len(open_deals)} kayıt.", stalled)
    step("stage_history", "stage", "derive", "Aşama olasılıkları geçmişten hesaplandı",
         "Bir aşamaya ulaşmış ve sonuçlanmış fırsatların kazanılma oranı: " + ", ".join(f"{s} %{p}" for s, p in probability.items() if s in OPEN_STAGES) + ".", 0)

    # --- Çıktılar ---
    CLEAN.mkdir(parents=True, exist_ok=True)
    GENERATED.mkdir(parents=True, exist_ok=True)
    accounts = accounts.sort_values("account").reset_index(drop=True)
    teams = teams.sort_values("sales_agent").reset_index(drop=True)
    pipeline = pipeline.sort_values("opportunity_id").reset_index(drop=True)
    accounts.to_csv(CLEAN / "accounts.csv", index=False)
    products.to_csv(CLEAN / "products.csv", index=False)
    teams.to_csv(CLEAN / "sales_teams.csv", index=False)
    out = pipeline.copy()
    for col in ["created_date", "close_date", "stage_entered_date"]:
        out[col] = out[col].dt.strftime("%Y-%m-%d")
    out.to_csv(CLEAN / "sales_pipeline.csv", index=False)
    history_out = history[["opportunity_id", "stage", "entered_date"]].copy()
    history_out["entered_date"] = history_out["entered_date"].dt.strftime("%Y-%m-%d")
    history_out.to_csv(CLEAN / "stage_history.csv", index=False)

    company_index = {name: i for i, name in enumerate(accounts["account"])}
    rep_index = {name: i for i, name in enumerate(teams["sales_agent"])}
    product_index = {name: i for i, name in enumerate(products["product"])}
    sources = sorted(pipeline["lead_source"].dropna().unique())
    reasons = sorted(pipeline["loss_reason"].dropna().unique())

    def date(value) -> str | None:
        return None if pd.isna(value) else value.strftime("%Y-%m-%d")

    def number(value) -> float | int | None:
        if pd.isna(value):
            return None
        return int(value) if float(value).is_integer() else round(float(value), 2)

    def index_of(values: list[str], value) -> int:
        return -1 if pd.isna(value) else values.index(value)

    dataset = {
        "meta": {
            "asOf": as_of.strftime("%Y-%m-%d"), "winRate": round(win_rate, 4), "stallDays": stall_days,
            "defaultProbability": probability, "leadSources": sources, "lossReasons": reasons,
        },
        "companies": [{
            "id": f"acc-{i + 1:03d}", "name": r.account, "sector": r.sector,
            "yearEstablished": number(r.year_established), "revenue": number(r.revenue), "employees": number(r.employees),
            "city": r.office_location, "parentId": None if pd.isna(r.subsidiary_of) else f"acc-{company_index[r.subsidiary_of] + 1:03d}",
        } for i, r in enumerate(accounts.itertuples())],
        "representatives": [{"id": f"rep-{i + 1:02d}", "name": r.sales_agent, "manager": r.manager, "region": r.regional_office} for i, r in enumerate(teams.itertuples())],
        "products": [{"id": f"prd-{i + 1}", "name": r.product, "series": r.series, "price": number(r.sales_price)} for i, r in enumerate(products.itertuples())],
        # Boyutu küçültmek için ilişkiler dizi sırasıyla kodlanır (-1 = boş):
        # [id, şirket, ürün, temsilci, aşama, tutar, oluşturulma, aşamaya giriş, kapanış, kaynak kanal, kayıp nedeni, indirim %]
        "opportunities": [[
            r.opportunity_id, -1 if pd.isna(r.account) else company_index[r.account],
            product_index[r.product], rep_index[r.sales_agent], STAGES.index(r.deal_stage),
            None if r.deal_stage in OPEN_STAGES else number(r.close_value),
            date(r.created_date), date(r.stage_entered_date), date(r.close_date),
            index_of(sources, r.lead_source), index_of(reasons, r.loss_reason), number(r.discount_pct),
        ] for r in pipeline.itertuples()],
    }
    # Veri sürümü: içerik değişirse tarayıcıda saklanan eski değişiklikler yeni veriye karıştırılmaz.
    dataset["meta"]["version"] = hashlib.sha256(json.dumps(dataset, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    data_profile = {
        "asOf": dataset["meta"]["asOf"],
        "tables": [{"name": name, "rawRows": len(raw[name]), "cleanRows": len(df), "columns": raw_profile[name]}
                   for name, df in [("accounts", accounts), ("products", products), ("sales_teams", teams), ("sales_pipeline", pipeline), ("stage_history", history)]],
        "steps": steps,
        "checks": checks,
        "metrics": {
            "winRate": round(win_rate, 4), "stalled": stalled, "open": len(open_deals),
            "openMissingAccount": int((missing_account & ~closed).sum()),
            "dateRange": [pipeline["created_date"].min().strftime("%Y-%m-%d"), dataset["meta"]["asOf"]],
        },
    }
    (GENERATED / "crm-data.ts").write_text(js_module("GeneratedDataset", "../dataset-types", "dataset", dataset), encoding="utf-8")
    (GENERATED / "data-profile.ts").write_text(js_module("DataProfile", "../dataset-types", "dataProfile", data_profile), encoding="utf-8")

    print(f"{len(dataset['opportunities'])} fırsat, {len(history)} aşama geçişi, {len(dataset['companies'])} şirket, {len(dataset['representatives'])} temsilci")
    print(f"Analiz tarihi {dataset['meta']['asOf']} · kazanma oranı %{win_rate * 100:.1f} · olasılıklar {probability} · eşikler {stall_days}")
    for s in steps:
        print(f"  [{s['kind']}] {s['table']}.{s['column']}: {s['title']} ({s['rows']})")
    for c in checks:
        print(f"  [{'OK ' if c['failing'] == 0 else 'BAD'}] {c['name']}: {c['failing']}/{c['total']}")


if __name__ == "__main__":
    main()
