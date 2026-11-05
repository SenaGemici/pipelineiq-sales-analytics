"""Sentetik CRM dışa aktarımı üretir: data/raw/*.csv

Kurgusal bir B2B yazılım şirketinin (Türkiye) satış verisini simüle eder. Tüm şirketler, kişiler ve
ürünler kurgusaldır. Her fırsat aşama aşama ilerler (Potansiyel → Nitelendirme → Teklif → Müzakere →
Kazanıldı/Kaybedildi); ilerleme olasılığı temsilci becerisine, kaynak kanala, ürüne, şirket büyüklüğüne
ve verilen indirime bağlıdır. Her aşama geçişi ayrı bir tabloya (stage_history) yazılır.

Veri, gerçek CRM dışa aktarımlarında sık görülen sorunları BİLEREK içerir; bunları temizlemek
pipeline/build_dataset.py'nin işidir. Sabit seed sayesinde çıktı her çalıştırmada aynıdır.

Çalıştırma:  python pipeline/generate_raw.py
"""

from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20261031
START, AS_OF = date(2025, 1, 1), date(2026, 10, 31)
RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
rng = random.Random(SEED)

OPEN_STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation"]
REGIONS = {
    "Marmara": ["İstanbul", "İstanbul", "İstanbul", "Bursa", "Kocaeli", "Tekirdağ"],
    "Ege ve Akdeniz": ["İzmir", "İzmir", "Antalya", "Denizli", "Adana", "Mersin"],
    "Anadolu": ["Ankara", "Ankara", "Konya", "Kayseri", "Eskişehir", "Gaziantep"],
}
SECTORS = {  # sektör: (şirket adı eki, ağırlık)
    "Perakende": ("Mağazacılık", 12), "Üretim": ("Sanayi", 14), "Lojistik": ("Lojistik", 9), "Finans": ("Finansal Hizmetler", 7),
    "Sağlık": ("Sağlık Grubu", 8), "Enerji": ("Enerji", 6), "Teknoloji": ("Bilişim", 11), "Gıda": ("Gıda", 9),
    "Eğitim": ("Eğitim Kurumları", 5), "Turizm": ("Turizm", 6), "Otomotiv": ("Otomotiv", 7),
}
# Kaynak kanal: (pay, kazanma etkisi [logit]). Referanslar en kaliteli, soğuk aramalar (Outbound) en zayıf kanal.
LEAD_SOURCES = {"Web": (0.30, 0.0), "Referans": (0.14, 0.7), "Etkinlik": (0.14, -0.1), "Outbound": (0.27, -0.5), "İş Ortağı": (0.15, 0.3)}
# Ekip yapısı: bazı temsilciler ağırlıklı olarak soğuk arama (Outbound) yapar, bazıları gelen talepleri karşılar.
# Bu yüzden ham kazanma oranı temsilcinin becerisini değil, büyük ölçüde fırsat karışımını yansıtır.
CHANNEL_PROFILES = {
    "dengeli": {source: share for source, (share, _) in LEAD_SOURCES.items()},
    "soğuk arama": {"Web": 0.15, "Referans": 0.03, "Etkinlik": 0.10, "Outbound": 0.65, "İş Ortağı": 0.07},
    "gelen talep": {"Web": 0.40, "Referans": 0.25, "Etkinlik": 0.12, "Outbound": 0.05, "İş Ortağı": 0.18},
}
# Aşama geçişi taban olasılıkları (logit) ve ortalama aşama süreleri (gün).
ADVANCE = {"Prospecting": 1.0, "Qualification": 0.85, "Proposal": 0.55, "Negotiation": 0.75}
DURATION = {"Prospecting": 6, "Qualification": 10, "Proposal": 13, "Negotiation": 11}
LOSS_REASONS = {
    "Prospecting": {"Yanıt yok": 60, "İhtiyaç yok": 30, "Zamanlama": 10},
    "Qualification": {"İhtiyaç yok": 35, "Bütçe yok": 30, "Yanıt yok": 20, "Zamanlama": 15},
    "Proposal": {"Fiyat": 35, "Rakip": 30, "Bütçe yok": 20, "Zamanlama": 15},
    "Negotiation": {"Fiyat": 40, "Rakip": 35, "Zamanlama": 15, "Bütçe yok": 10},
}
STEMS = ["Lodos", "Poyraz", "Ilgaz", "Kervan", "Mavera", "Derinsu", "Akçam", "Tunaboyu", "Sedirli", "Çınaraltı", "Yelkenli", "Kardelen",
         "Gökova", "Mercanköşk", "Bozkırlı", "Karaçam", "Ardıçlı", "Defneli", "Narçiçeği", "Kuzeyrüzgar", "Altınkum", "Yamaçlı", "Toprakkale",
         "Akyaka", "Serencam", "Ilıca", "Beyazsu", "Kayalar", "Pınarbaşı", "Dorukyıldız", "Gümüşdere", "Taşköprülü", "Yeşilvadi", "Mavişehir",
         "Kızılcam", "Sarıkaya", "Erguvan", "Söğütlü", "Ağaçlı", "Esentepeli", "Akdoğan", "Kumsallı", "Tepeüstü", "Göknar", "Çağlayan",
         "Ortaköylü", "Demirkapı", "Yıldızeli", "Uzunyayla", "Karadut", "Laleli", "Bademli", "Zeytinköy", "Ceviz", "Selvili", "Kestaneli",
         "Bakırçay", "İncesu", "Gölbaşılı", "Narlıdere", "Akbulut", "Karlıova", "Kocayayla", "Sarıçam", "Aydoğan", "Ilgın", "Gediz",
         "Menekşe", "Kuşadalı", "Turunç", "Çamlıbel", "Ayçiçek", "Kumluca", "Pamukova", "Yazlıkçı", "Eğrigöz", "Kartaltepe", "Sütlüce", "Mor Salkım",
         "Dereboyu", "Kayın", "Akarsu", "Ilgıt", "Bereketli", "Yeşilırmaklı", "Karapınar", "Sünbül", "Gelincik", "Ihlamur", "Çamyurt", "Ovacık"]
LEGAL = ["A.Ş.", "A.Ş.", "A.Ş.", "Ltd. Şti."]
PRODUCTS = [  # ad, seri, yıllık liste fiyatı (USD), kazanma etkisi (logit), süre çarpanı
    ("Bulut Başlangıç", "Bulut", 1200, 0.35, 0.6), ("Bulut Pro", "Bulut", 4800, 0.1, 0.9), ("Bulut Kurumsal", "Bulut", 14500, -0.25, 1.4),
    ("Analitik Lite", "Analitik", 2400, 0.2, 0.8), ("Analitik Plus", "Analitik", 7900, -0.05, 1.1),
    ("Güvenlik Kalkan", "Güvenlik", 3600, 0.05, 0.9), ("Güvenlik Tam", "Güvenlik", 22000, -0.45, 1.7),
]
FIRST = ["Ayşe", "Mehmet", "Zeynep", "Mustafa", "Elif", "Emre", "Merve", "Burak", "Selin", "Can", "Deniz", "Ece", "Kerem", "İrem", "Onur",
         "Gizem", "Hakan", "Seda", "Tolga", "Büşra", "Serkan", "Pınar", "Barış", "Ceren", "Umut", "Damla", "Oğuz", "Nazlı", "Kaan", "Esra",
         "Murat", "Aslı", "Volkan", "Gül", "Cem", "Derya"]
LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Koç",
        "Kurt", "Özdemir", "Şimşek", "Polat", "Erdoğan", "Tekin", "Güneş", "Bulut", "Karaca", "Uçar", "Tunç", "Aksoy", "Bozkurt", "Ekinci",
        "Turan", "Keskin", "Sezer", "Toprak", "Ateş", "Işık", "Akın", "Er"]
MONTH_SEASON = [0.9, 0.95, 1.05, 1.0, 1.0, 0.9, 0.75, 0.7, 1.05, 1.15, 1.2, 1.25]


def logistic(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def iso(d: date | None) -> str:
    return "" if d is None else d.isoformat()


def weighted(options: dict[str, float]) -> str:
    return rng.choices(list(options), weights=list(options.values()))[0]


def discount_effect(discount: float) -> float:
    # İndirim müzakerede kazanma şansını artırır ama ~%15'ten sonra etkisi doyar (azalan getiri).
    return 0.09 * min(discount, 15) + 0.01 * max(0, discount - 15)


def build() -> None:
    names = rng.sample(FIRST, len(FIRST))
    people = [f"{f} {l}" for f, l in zip(names, rng.sample(LAST, len(names)))]

    # --- Satış ekibi: bölge başına 2 yönetici, her yöneticinin 5 temsilcisi ---
    teams, managers, reps = [], iter(people[:6]), people[6:]
    rep_info = {}
    for region in REGIONS:
        for _ in range(2):
            manager = next(managers)
            for _ in range(5):
                rep = reps.pop()
                teams.append({"sales_agent": rep, "manager": manager, "regional_office": region})
                # Her temsilcinin bir beceri düzeyi ve indirim verme eğilimi vardır.
                rep_info[rep] = {"region": region, "skill": rng.gauss(0, 0.3), "discount_bias": rng.gauss(0, 4), "hired": START,
                                 "channels": CHANNEL_PROFILES[rng.choice(list(CHANNEL_PROFILES))]}
    for rep in rng.sample(list(rep_info), 3):  # son ay işe alınan, henüz fırsatı olmayan temsilciler
        rep_info[rep]["hired"] = AS_OF + timedelta(days=1)

    # --- Şirketler: 5 holding + 80 şirket; bir kısmı holding iştiraki ---
    accounts = []
    for i, stem in enumerate(rng.sample(STEMS, 85)):
        if i < 5:
            sector, suffix = "Holding", "Holding"
        else:
            sector = rng.choices(list(SECTORS), weights=[w for _, w in SECTORS.values()])[0]
            suffix = SECTORS[sector][0]
        employees = int(min(40000, max(12, rng.lognormvariate(6.8, 1.3))))
        region = rng.choice(list(REGIONS))
        accounts.append({
            "account": f"{stem} {suffix} {rng.choice(LEGAL) if i >= 5 else 'A.Ş.'}", "sector": sector,
            "year_established": rng.randint(1972, 2021), "revenue": round(employees * rng.uniform(0.08, 0.35), 2),
            "employees": employees, "office_location": rng.choice(REGIONS[region]), "subsidiary_of": "", "_region": region,
        })
    holdings = [a["account"] for a in accounts[:5]]
    for account in rng.sample(accounts[5:], 14):
        account["subsidiary_of"] = rng.choice(holdings)

    # --- Fırsatlar ve aşama geçmişi ---
    rows, history = [], []
    month, number = date(START.year, START.month, 1), 10000
    while month <= AS_OF:
        months_from_start = (month.year - START.year) * 12 + month.month - 1
        volume = int(250 * (1.02 ** months_from_start) * MONTH_SEASON[month.month - 1] * rng.uniform(0.92, 1.08))
        next_month = date(month.year + month.month // 12, month.month % 12 + 1, 1)
        for _ in range(volume):
            created = month + timedelta(days=rng.randrange((min(next_month, AS_OF + timedelta(days=1)) - month).days))
            number += 1
            row, events = simulate(f"OPP-{number}", created, rep_info, accounts)
            rows.append(row)
            history.extend(events)
        month = next_month

    inject_problems(rows, accounts)
    write(rows, history, accounts, teams)


def simulate(opportunity_id: str, created: date, rep_info: dict, accounts: list[dict]) -> tuple[dict, list[dict]]:
    rep = rng.choice([r for r, info in rep_info.items() if info["hired"] <= created])
    info = rep_info[rep]
    account = rng.choice([a for a in accounts if a["_region"] == info["region"]] if rng.random() < 0.8 else accounts)
    size = math.log10(account["employees"])
    product = rng.choices(PRODUCTS, weights=[max(0.2, 3.2 - abs(size - (1.8 + j * 0.45))) for j in range(len(PRODUCTS))])[0]
    name, _, price, product_effect, cycle_factor = product
    source = weighted(info["channels"])
    source_effect = LEAD_SOURCES[source][1]
    speed = cycle_factor * {"Referans": 0.8, "Outbound": 1.2}.get(source, 1.0)

    events = [{"opportunity_id": opportunity_id, "stage": "Prospecting", "entered_date": iso(created)}]
    stage, day, discount, outcome, loss_reason = "Prospecting", created, None, None, ""
    while True:
        duration = max(1, int(rng.gammavariate(2.5, DURATION[stage] * speed / 2.5)))
        # Bazı fırsatlar bu aşamada unutulur: bir daha güncellenmez ve açık kalır.
        if rng.random() < 0.025:
            break
        if stage == "Proposal":
            discount = round(min(30, max(0, rng.gauss(9 + info["discount_bias"], 5))), 1)
        early = stage in ("Prospecting", "Qualification")
        logit = (ADVANCE[stage] + info["skill"] + source_effect * (1.0 if early else 0.5)
                 + (product_effect if not early else 0) + (0.1 if size > 3.3 and not early else 0)
                 + (discount_effect(discount) - 0.6 if stage == "Negotiation" else 0))
        advance = rng.random() < logistic(logit)
        next_day = day + timedelta(days=duration if advance else int(duration * 1.3) + 1)
        if next_day > AS_OF:
            break  # analiz tarihinde hâlâ bu aşamada
        if not advance:
            reasons = dict(LOSS_REASONS[stage])
            if "Fiyat" in reasons and discount is not None and discount < 5:
                reasons["Fiyat"] *= 1.8  # indirim verilmeyen tekliflerde fiyat itirazı daha sık
            outcome, loss_reason, day = "Lost", weighted(reasons), next_day
            break
        day = next_day
        if stage == "Negotiation":
            outcome = "Won"
            break
        stage = OPEN_STAGES[OPEN_STAGES.index(stage) + 1]
        events.append({"opportunity_id": opportunity_id, "stage": stage, "entered_date": iso(day)})

    row = {"opportunity_id": opportunity_id, "sales_agent": rep, "product": name, "account": account["account"], "lead_source": source,
           "deal_stage": stage, "created_date": iso(created), "close_date": "", "close_value": "",
           "discount_pct": "" if discount is None else str(discount), "loss_reason": ""}
    if outcome:
        events.append({"opportunity_id": opportunity_id, "stage": outcome, "entered_date": iso(day)})
        row.update(deal_stage=outcome, close_date=iso(day))
        row["close_value"] = str(round(price * (1 - (discount or 0) / 100) * rng.gauss(1, 0.03))) if outcome == "Won" else "0"
        row["loss_reason"] = loss_reason
    return row, events


def inject_problems(rows: list[dict], accounts: list[dict]) -> None:
    """Gerçek CRM dışa aktarımlarında sık görülen sorunları bilerek ekler."""
    open_rows = [r for r in rows if r["deal_stage"] in OPEN_STAGES]
    closed_rows = [r for r in rows if r["deal_stage"] in ("Won", "Lost")]
    # 1) Şirket alanı boş bırakılmış fırsatlar (çoğunlukla açık fırsatlarda; kayıt girişinde zorunlu değil).
    for r in rng.sample(open_rows, int(len(open_rows) * 0.2)) + rng.sample(closed_rows, 30):
        r["account"] = ""
    # 2) Mükerrer şirketler: aynı şirket farklı yazımla ikinci kez açılmış; bazı fırsatlar bu kopyaya bağlı.
    for account in rng.sample([a for a in accounts if a["sector"] != "Holding" and not a["subsidiary_of"]], 4):
        duplicate = dict(account)
        duplicate["account"] = account["account"].upper().replace("A.Ş.", "AS").replace("LTD. ŞTİ.", "LTD STI")
        duplicate["year_established"], duplicate["employees"] = "", ""  # kopyada bilgiler eksik girilmiş
        accounts.append(duplicate)
        linked = [r for r in rows if r["account"] == account["account"]]
        for r in rng.sample(linked, len(linked) // 3):
            r["account"] = duplicate["account"]
    # 3) Sektör ve şehir yazım farkları.
    variants = {"Perakende": "perakende", "Teknoloji": "Teknolji", "Lojistik": "Lojistk", "Sağlık": "Saglik", "Üretim": "ÜRETİM"}
    for account in rng.sample([a for a in accounts if a["sector"] in variants], 9):
        account["sector"] = variants[account["sector"]]
    cities = {"İstanbul": ["Istanbul", "istanbul", "İST"], "İzmir": ["Izmir"], "Eskişehir": ["Eskisehir"], "Ankara": ["ANKARA"]}
    for account in rng.sample([a for a in accounts if a["office_location"] in cities], 8):
        account["office_location"] = rng.choice(cities[account["office_location"]])
    # 4) Ürün, temsilci ve kaynak kanal yazım farkları.
    for r in rng.sample(rows, 380):
        r["product"] = rng.choice([r["product"].replace(" ", ""), r["product"].lower(), r["product"] + " "])
    for r in rng.sample(rows, 120):
        r["sales_agent"] = rng.choice([r["sales_agent"].lower(), "  " + r["sales_agent"], r["sales_agent"].replace(" ", "  ")])
    source_variants = {"Web": ["web", "Web sitesi", "WEB"], "Referans": ["referans", "Referral"], "İş Ortağı": ["Is Ortagi", "iş ortağı"], "Outbound": ["outbound"]}
    for r in rng.sample([r for r in rows if r["lead_source"] in source_variants], 300):
        r["lead_source"] = rng.choice(source_variants[r["lead_source"]])
    # 5) Kaynak kanalı boş bırakılmış fırsatlar.
    for r in rng.sample(rows, int(len(rows) * 0.05)):
        r["lead_source"] = ""
    # 6) İndirim alanı farklı biçimlerde girilmiş: "%12,5", "12,5".
    for r in rng.sample([r for r in rows if r["discount_pct"]], 200):
        r["discount_pct"] = rng.choice([f"%{r['discount_pct']}", r["discount_pct"].replace(".", ",")])
    # 7) Bir kısım tarih GG.AA.YYYY biçiminde dışa aktarılmış.
    for r in rng.sample(rows, 260):
        for col in ("created_date", "close_date"):
            if r[col]:
                y, m, d = r[col].split("-")
                r[col] = f"{d}.{m}.{y}"
    # 8) Kazanılmış ama tutarı girilmemiş; kaybedilmiş ama nedeni girilmemiş fırsatlar.
    for r in rng.sample([r for r in rows if r["deal_stage"] == "Won"], 28):
        r["close_value"] = ""
    lost = [r for r in rows if r["deal_stage"] == "Lost"]
    for r in rng.sample(lost, int(len(lost) * 0.08)):
        r["loss_reason"] = ""
    # 9) Oluşturulma tarihi hatalı girilmiş: kapanıştan sonraya düşüyor (aşama geçmişinde doğrusu var).
    for r in rng.sample([r for r in rows if r["close_date"] and "." not in r["created_date"] and "." not in r["close_date"]], 16):
        r["created_date"] = iso(date.fromisoformat(r["close_date"]) + timedelta(days=rng.randint(3, 40)))
    # 10) Dışa aktarımda iki kez yazılmış satırlar.
    rows.extend(dict(r) for r in rng.sample(rows, 45))
    rng.shuffle(rows)


def write(rows: list[dict], history: list[dict], accounts: list[dict], teams: list[dict]) -> None:
    RAW.mkdir(parents=True, exist_ok=True)

    def dump(name: str, records: list[dict], fields: list[str]) -> None:
        with open(RAW / f"{name}.csv", "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(records)

    rng.shuffle(accounts)
    dump("accounts", accounts, ["account", "sector", "year_established", "revenue", "employees", "office_location", "subsidiary_of"])
    dump("products", [{"product": p[0], "series": p[1], "sales_price": p[2]} for p in PRODUCTS], ["product", "series", "sales_price"])
    dump("sales_teams", teams, ["sales_agent", "manager", "regional_office"])
    dump("sales_pipeline", rows, ["opportunity_id", "sales_agent", "product", "account", "lead_source", "deal_stage",
                                  "created_date", "close_date", "close_value", "discount_pct", "loss_reason"])
    dump("stage_history", history, ["opportunity_id", "stage", "entered_date"])
    print(f"{len(rows)} fırsat satırı, {len(history)} aşama geçişi, {len(accounts)} şirket satırı, {len(teams)} temsilci, {len(PRODUCTS)} ürün → {RAW}")


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    build()
