"""Sentetik CRM dışa aktarımı üretir: data/raw/*.csv

Kurgusal bir B2B yazılım şirketinin (Türkiye) satış verisini simüle eder. Tüm şirketler, kişiler ve
ürünler kurgusaldır. Veri, gerçek CRM dışa aktarımlarında sık görülen sorunları BİLEREK içerir;
bunları temizlemek pipeline/build_dataset.py'nin işidir. Sabit seed sayesinde çıktı her çalıştırmada aynıdır.

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
STEMS = ["Lodos", "Poyraz", "Ilgaz", "Kervan", "Mavera", "Derinsu", "Akçam", "Tunaboyu", "Sedirli", "Çınaraltı", "Yelkenli", "Kardelen",
         "Gökova", "Mercanköşk", "Bozkırlı", "Karaçam", "Ardıçlı", "Defneli", "Narçiçeği", "Kuzeyrüzgar", "Altınkum", "Yamaçlı", "Toprakkale",
         "Akyaka", "Serencam", "Ilıca", "Beyazsu", "Kayalar", "Pınarbaşı", "Dorukyıldız", "Gümüşdere", "Taşköprülü", "Yeşilvadi", "Mavişehir",
         "Kızılcam", "Sarıkaya", "Erguvan", "Söğütlü", "Ağaçlı", "Esentepeli", "Akdoğan", "Kumsallı", "Tepeüstü", "Göknar", "Çağlayan",
         "Ortaköylü", "Demirkapı", "Yıldızeli", "Uzunyayla", "Karadut", "Laleli", "Bademli", "Zeytinköy", "Ceviz", "Selvili", "Kestaneli",
         "Bakırçay", "İncesu", "Gölbaşılı", "Narlıdere", "Akbulut", "Karlıova", "Kocayayla", "Sarıçam", "Aydoğan", "Ilgın", "Gediz",
         "Menekşe", "Kuşadalı", "Turunç", "Çamlıbel", "Ayçiçek", "Kumluca", "Pamukova", "Yazlıkçı", "Eğrigöz", "Kartaltepe", "Sütlüce", "Mor Salkım",
         "Dereboyu", "Kayın", "Akarsu", "Ilgıt", "Bereketli", "Yeşilırmaklı", "Karapınar", "Sünbül", "Gelincik", "Ihlamur", "Çamyurt", "Ovacık"]
LEGAL = ["A.Ş.", "A.Ş.", "A.Ş.", "Ltd. Şti."]
PRODUCTS = [  # ad, seri, yıllık liste fiyatı (USD), kazanma etkisi (logit), satış süresi çarpanı
    ("Bulut Başlangıç", "Bulut", 1200, 0.45, 0.6), ("Bulut Pro", "Bulut", 4800, 0.15, 0.9), ("Bulut Kurumsal", "Bulut", 14500, -0.30, 1.4),
    ("Analitik Lite", "Analitik", 2400, 0.30, 0.8), ("Analitik Plus", "Analitik", 7900, -0.05, 1.1),
    ("Güvenlik Kalkan", "Güvenlik", 3600, 0.10, 0.9), ("Güvenlik Tam", "Güvenlik", 22000, -0.55, 1.7),
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
                rep_info[rep] = {"region": region, "skill": rng.gauss(0, 0.35), "hired": START}
    # Son ay işe alınan, henüz fırsatı olmayan üç temsilci.
    for rep in rng.sample(list(rep_info), 3):
        rep_info[rep]["hired"] = AS_OF + timedelta(days=1)

    # --- Şirketler: 5 holding + 80 şirket; bir kısmı holding iştiraki ---
    stems = rng.sample(STEMS, 85)
    accounts = []
    for i, stem in enumerate(stems):
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

    # --- Fırsatlar ---
    rows = []
    month, number = date(START.year, START.month, 1), 10000
    while month <= AS_OF:
        months_from_start = (month.year - START.year) * 12 + month.month - 1
        volume = int(230 * (1.02 ** months_from_start) * MONTH_SEASON[month.month - 1] * rng.uniform(0.92, 1.08))
        next_month = date(month.year + month.month // 12, month.month % 12 + 1, 1)
        for _ in range(volume):
            engage = month + timedelta(days=rng.randrange((min(next_month, AS_OF + timedelta(days=1)) - month).days))
            rep = rng.choice([r for r, info in rep_info.items() if info["hired"] <= engage])
            region = rep_info[rep]["region"]
            pool = [a for a in accounts if a["_region"] == region] if rng.random() < 0.8 else accounts
            account = rng.choice(pool)
            size = math.log10(account["employees"])
            # Büyük şirketler pahalı ürünlere daha yatkındır.
            weights = [max(0.2, 3.2 - abs(size - (1.8 + j * 0.45))) for j in range(len(PRODUCTS))]
            product = rng.choices(PRODUCTS, weights=weights)[0]
            name, _, price, product_effect, cycle_factor = product
            p_win = logistic(0.35 + rep_info[rep]["skill"] + product_effect + (0.15 if account["sector"] == "Teknoloji" else 0))
            won = rng.random() < p_win
            mean_cycle = 46 * cycle_factor * (1 if won else 0.75)
            cycle = max(1, int(rng.gammavariate(3.0, mean_cycle / 3.0)))
            close = engage + timedelta(days=cycle)
            number += 1
            row = {"opportunity_id": f"OPP-{number}", "sales_agent": rep, "product": name, "account": account["account"],
                   "deal_stage": "Engaging", "engage_date": iso(engage), "close_date": "", "close_value": ""}
            # Kaybedilmesi gereken fırsatların bir kısmı hiç kapatılmaz: CRM'de "unutulan" fırsatlar.
            forgotten = not won and rng.random() < 0.18
            if close <= AS_OF and not forgotten:
                row["deal_stage"] = "Won" if won else "Lost"
                row["close_date"] = iso(close)
                row["close_value"] = str(round(price * min(1.12, max(0.7, rng.gauss(0.94, 0.08))))) if won else "0"
            rows.append(row)
        month = next_month

    # Potansiyel (Prospecting) aşamasındaki, henüz görüşülmemiş son dönem fırsatları.
    for _ in range(420):
        rep = rng.choice([r for r, info in rep_info.items() if info["hired"] <= AS_OF])
        account = rng.choice([a for a in accounts if a["_region"] == rep_info[rep]["region"]])
        number += 1
        rows.append({"opportunity_id": f"OPP-{number}", "sales_agent": rep, "product": rng.choices(PRODUCTS, weights=[5, 4, 2, 4, 3, 3, 1])[0][0],
                     "account": account["account"], "deal_stage": "Prospecting", "engage_date": "", "close_date": "", "close_value": ""})

    inject_problems(rows, accounts, teams)
    write(rows, accounts, teams)


def inject_problems(rows: list[dict], accounts: list[dict], teams: list[dict]) -> None:
    """Gerçek CRM dışa aktarımlarında sık görülen sorunları bilerek ekler."""
    open_rows = [r for r in rows if r["deal_stage"] in ("Prospecting", "Engaging")]
    closed_rows = [r for r in rows if r["deal_stage"] in ("Won", "Lost")]
    # 1) Şirket alanı boş bırakılmış fırsatlar (çoğunlukla açık fırsatlarda; kayıt girişinde zorunlu değil).
    for r in rng.sample(open_rows, int(len(open_rows) * 0.22)) + rng.sample(closed_rows, 30):
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
    # 4) Ürün adı yazım farkları.
    for r in rng.sample(rows, 380):
        r["product"] = rng.choice([r["product"].replace(" ", ""), r["product"].lower(), r["product"] + " "])
    # 5) Temsilci adında büyük/küçük harf ve boşluk farkları.
    for r in rng.sample(rows, 120):
        r["sales_agent"] = rng.choice([r["sales_agent"].lower(), "  " + r["sales_agent"], r["sales_agent"].replace(" ", "  ")])
    # 6) Bir kısım tarih GG.AA.YYYY biçiminde dışa aktarılmış.
    for r in rng.sample([r for r in rows if r["engage_date"]], 260):
        for col in ("engage_date", "close_date"):
            if r[col]:
                y, m, d = r[col].split("-")
                r[col] = f"{d}.{m}.{y}"
    # 7) Kazanılmış ama tutarı girilmemiş fırsatlar.
    for r in rng.sample([r for r in rows if r["deal_stage"] == "Won"], 28):
        r["close_value"] = ""
    # 8) Kapanış tarihi görüşme tarihinden önce görünen kayıtlar (tarihler yer değiştirmiş).
    for r in rng.sample([r for r in rows if r["close_date"] and "." not in r["engage_date"]], 16):
        r["engage_date"], r["close_date"] = r["close_date"], r["engage_date"]
    # 9) Dışa aktarımda iki kez yazılmış satırlar.
    rows.extend(dict(r) for r in rng.sample(rows, 45))
    rng.shuffle(rows)


def write(rows: list[dict], accounts: list[dict], teams: list[dict]) -> None:
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
    dump("sales_pipeline", rows, ["opportunity_id", "sales_agent", "product", "account", "deal_stage", "engage_date", "close_date", "close_value"])
    print(f"{len(rows)} fırsat satırı, {len(accounts)} şirket satırı, {len(teams)} temsilci, {len(PRODUCTS)} ürün → {RAW}")


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    build()
