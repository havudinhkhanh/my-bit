"""Tin crypto nhiều nguồn + thông báo Binance (niêm yết / huỷ niêm yết), gắn coin và phân loại tác động.

Nguồn: RSS CoinDesk, Cointelegraph, The Block, Decrypt, Bitcoin Magazine; Google News theo tên coin (nhóm OI lớn);
Binance announcements (Delisting, New Listing). Gắn coin theo tên đầy đủ hoặc ký hiệu viết hoa (bỏ ký hiệu dễ nhầm với từ thường).
"""
from __future__ import annotations

import html
import logging
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote_plus

import pandas as pd
import requests

from . import src, store

log = logging.getLogger("cnews")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"}
_TAG = re.compile(r"<[^>]+>")
FEEDS = {
    "CoinDesk": ["https://www.coindesk.com/arc/outboundfeeds/rss/"],
    "Cointelegraph": ["https://cointelegraph.com/rss"],
    "The Block": ["https://www.theblock.co/rss.xml"],
    "Decrypt": ["https://decrypt.co/feed"],
    "Bitcoin Magazine": ["https://bitcoinmagazine.com/.rss/full/"],
}
# ký hiệu trùng từ tiếng Anh thông dụng → chỉ gắn khi có "$" đứng trước hoặc khớp tên đầy đủ
AMBIG = {"ONE", "S", "IT", "ME", "MOVE", "SUN", "GAS", "ID", "ACE", "AI", "ALL", "ANY", "ARK", "BAND", "BLUR", "CAT", "CHR", "CORE", "DOG", "EDGE",
         "FUN", "GOAT", "HIGH", "HOOK", "KEY", "LAND", "LIT", "MAGIC", "MASK", "MET", "NEAR", "NOT", "OM", "ONG", "OP", "OPEN", "ORDER", "PEOPLE",
         "PUMP", "QUICK", "RARE", "RED", "REAL", "SAFE", "SAND", "SIGN", "SKY", "SPELL", "STORY", "SUPER", "TRUMP", "TURBO", "UNI", "USUAL", "VANA",
         "WAVES", "WIN", "WOO", "X", "XAI", "ZRO", "BIO", "BANK", "BOME", "COW", "DEGEN", "DRIFT", "FORM", "GRASS", "HOME", "KAITO", "LAYER",
         "MEW", "MORPHO", "NIL", "PLUME", "RAY", "RED", "SAGA", "SONIC", "TAO", "TON", "TRUTH", "VIRTUAL", "WAL", "WET", "ZK", "A", "B", "C", "U",
         "BR", "CASH", "JST", "LISTA", "NEWS", "MAJOR", "ZERO", "LUNA", "GLM", "BEAM", "FLOW", "ROSE", "SUI", "Q", "W", "H", "M", "F", "G", "T", "P", "CT", "OL", "CP", "BB", "AT", "AVA", "MON", "IP", "EGLD", "HYPER", "SOL", "LINK", "DOT", "ATOM"}
GENERIC_NAMES = {"bitcoin cash", "sky", "story", "movement", "sonic", "plasma", "aster", "monad", "berachain", "pump.fun", "sei", "the graph",
                 "internet computer", "near protocol", "official trump", "world liberty financial", "ethena usde"}
RULES = [  # (regex, nhãn, dấu, mức)
    (r"\b(hack(ed)?|exploit(ed)?|drain(ed)?|stolen|attack(er)?|breach)\b", "Bị tấn công / mất tiền", -1, 3),
    (r"\b(rug ?pull|insolven\w*|bankrupt\w*|halts? withdrawals?|freez\w+ (withdrawals|funds))\b", "Mất thanh khoản / phá sản", -1, 3),
    (r"\bdelist\w*|will remove|cease trading", "Huỷ niêm yết", -1, 3),
    (r"\b(sec|cftc|doj|regulator\w*) (sues|charges|files|sued|charged)|\blawsuit\b|\bindict\w*", "Pháp lý", -1, 2),
    (r"\bdepeg\w*", "Mất neo giá", -1, 3),
    (r"\bmonitoring tag\b|\bseed tag\b", "Bị gắn nhãn theo dõi (Binance)", -1, 2),
    (r"\b(token )?unlock\w*\b", "Mở khoá token", -1, 1),
    (r"\b(outflows?|sell-?off|dump\w*|liquidat\w+|plunge\w*|crash\w*|slump\w*)\b", "Giảm mạnh / dòng tiền ra", -1, 1),
    (r"\b(investigat\w+|probe|subpoena|fine[ds]?|ban(s|ned)?)\b", "Điều tra / phạt", -1, 2),
    (r"\bwill (list|add)\b|\blists\b(?! of)|\blisted on\b|\blisting\b|\blaunchpool\b|\bhodler airdrop", "Niêm yết mới", 1, 2),
    (r"\betf\b.*\b(approv\w*|launch\w*|filing|files)\b|\b(approv\w*)\b.*\betf\b", "ETF", 1, 2),
    (r"\b(buyback|burn\w*)\b", "Mua lại / đốt token", 1, 1),
    (r"\b(partner\w*|integrat\w*|acquir\w*|mainnet|upgrade)\b", "Hợp tác / nâng cấp", 1, 1),
    (r"\b(inflows?|surge\w*|soar\w*|rall(y|ies)|record high|all-time high)\b", "Tăng mạnh / dòng tiền vào", 1, 1),
]
_RULES = [(re.compile(a, re.I), b, c, d) for a, b, c, d in RULES]


def classify(title: str) -> tuple[str | None, int, int]:
    for rx, tag, sign, sev in _RULES:
        if rx.search(title or ""):
            return tag, sign, sev
    return None, 0, 0


SPAM_SRC = re.compile(r"openpr|globenewswire|prnewswire|accesswire|captain ?altcoin|blockonomi|crypto ?daily|bitcoinist|coinpedia|analytics insight|"
                      r"techbullion|newsbtc|zycrypto|crypto-economy|u\.today|benzinga", re.I)
SPAM_TITLE = re.compile(r"price prediction|best crypto|to buy now|presale|pre-sale|\b100x\b|\b1000x\b|could explode|millionaire|next (big|crypto)", re.I)


def _parse(content: bytes, src_name: str) -> list[dict]:
    root = ET.fromstring(content)
    out = []
    for it in root.iter("item"):
        title = html.unescape((it.findtext("title") or "").strip())
        desc = html.unescape(_TAG.sub(" ", it.findtext("description") or "")).strip()
        link = (it.findtext("link") or "").strip()
        s_el = it.find("source")
        s2 = (s_el.text or "").strip() if s_el is not None and s_el.text else src_name
        try:
            ts = pd.to_datetime(it.findtext("pubDate") or "", utc=True).tz_localize(None)
        except (ValueError, TypeError):
            ts = pd.Timestamp.utcnow().tz_localize(None)
        if s2 != src_name and title.endswith(" - " + s2):
            title = title[: -len(s2) - 3]
        if SPAM_SRC.search(s2) or SPAM_TITLE.search(title):     # thông cáo trả tiền / quảng cáo presale
            continue
        out.append({"title": title, "desc": desc[:300], "link": link, "src": s2, "time": ts})
    return out


def _get(url: str, name: str):
    try:
        r = requests.get(url, timeout=20, headers=UA)
        return name, (_parse(r.content, name) if r.status_code == 200 else [])
    except Exception:  # noqa: BLE001
        return name, []


def _matchers(coins: list[dict]):
    """coins: [{key, sym, name}] theo thứ tự ưu tiên (vốn hoá)."""
    by_name, by_sym = [], {}
    for c in coins:
        nm = (c.get("name") or "").strip()
        if len(nm) >= 4 and nm.lower() not in GENERIC_NAMES:
            by_name.append((re.compile(r"(?<![\w$])" + re.escape(nm) + r"(?!\w)", re.I), c["key"]))
        s = (c.get("sym") or "").upper()
        if s and s not in by_sym:
            by_sym[s] = c["key"]
    return by_name, by_sym


def tag(text: str, by_name, by_sym) -> set[str]:
    out = set()
    for rx, k in by_name:
        if rx.search(text):
            out.add(k)
    for m in re.finditer(r"(\$?)\b([A-Z][A-Z0-9]{1,9})\b", text):
        dollar, s = m.group(1), m.group(2)
        k = by_sym.get(s)
        if k and (dollar or (s not in AMBIG and len(s) >= 3)):
            out.add(k)
    return out


def fetch(coins: list[dict], focus: list[dict], budget: float = 120) -> tuple[pd.DataFrame, dict]:
    t0 = time.time()
    jobs = [(u, n) for n, L in FEEDS.items() for u in L]
    for c in focus[:45]:
        q = f'"{c["name"]}" crypto when:2d'
        jobs.append((f"https://news.google.com/rss/search?q={quote_plus(q)}&hl=en-US&gl=US&ceid=US:en", "Google News"))
    items, stats = [], {}
    with ThreadPoolExecutor(8) as ex:
        for f in as_completed([ex.submit(_get, u, n) for u, n in jobs]):
            n, L = f.result()
            stats[n] = stats.get(n, 0) + len(L)
            items += L
            if time.time() - t0 > budget:
                break
    # Binance: huỷ niêm yết (161), niêm yết mới (48)
    for cat in (161, 48):
        try:
            for a in src.binance_announcements(cat, 20):
                items.append({"title": a["title"], "desc": "", "link": f"https://www.binance.com/en/support/announcement/{a['code']}", "src": "Binance", "time": a["time"]})
                stats["Binance"] = stats.get("Binance", 0) + 1
        except Exception as e:  # noqa: BLE001
            stats[f"Binance {cat} lỗi"] = str(e)[:80]
    by_name, by_sym = _matchers(coins)
    rows = []
    for x in items:
        if x["src"] == "Binance":       # tiêu đề Binance ghi ký hiệu viết hoa: "Binance Will Delist ABC, XYZ…"
            ks = {by_sym[s] for s in re.findall(r"\b[A-Z0-9]{2,12}\b", x["title"]) if s in by_sym and s not in ("USDT", "USDC", "FDUSD")}
        else:
            ks = tag(f"{x['title']} {x['desc'][:160]}", by_name, by_sym)
        tg, sign, sev = classify(x["title"])
        if x["src"] == "Binance" and tg is None:
            tg, sign, sev = ("Thông báo Binance", 0, 1)
        for k in ks or ["_"]:
            rows.append({"key": k, "time": x["time"], "title": x["title"][:240], "link": x["link"], "src": x["src"], "tag": tg, "sign": sign, "sev": sev})
    df = pd.DataFrame(rows)
    if not df.empty:
        df["k"] = df["title"].str.lower().str.replace(r"\W+", " ", regex=True).str.strip()
        df = df.sort_values("time").drop_duplicates(["key", "k"], keep="first").drop(columns="k")
    return df, stats


NEWS_VER = 2   # tăng khi đổi luật gắn coin/phân loại → bỏ kho tin cũ


def save(df: pd.DataFrame) -> pd.DataFrame:
    m = store.meta()
    old = store.read("news") if m.get("news_ver") == NEWS_VER else pd.DataFrame()
    m["news_ver"] = NEWS_VER
    store.save_meta(m)
    all_ = pd.concat([old, df], ignore_index=True) if not old.empty else df
    if all_.empty:
        return all_
    all_["time"] = pd.to_datetime(all_["time"])
    all_ = all_[~all_["src"].astype(str).str.contains(SPAM_SRC) & ~all_["title"].astype(str).str.contains(SPAM_TITLE)]
    all_ = all_[all_["time"] >= pd.Timestamp.utcnow().tz_localize(None) - pd.Timedelta(days=30)]
    all_ = all_.drop_duplicates(["key", "title"], keep="first").sort_values("time")
    store.write("news", all_)
    return all_
