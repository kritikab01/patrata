"""SQLite store. Gives us: an audit trail of every decision, results that survive a
page refresh (E-Q5), idempotent double-submits, a cache so the same explanation is
never paid for twice (E-Q6), and the human review workflow (C-Q2, C-Q3)."""
import hashlib
import json
import sqlite3
import threading
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from . import config as C

_lock = threading.Lock()

STATUS = {
    "APPROVE": "Pre-approved",
    "DECLINE": "Declined",
    "REFER": "Awaiting review",
}


@contextmanager
def conn():
    with _lock:
        c = sqlite3.connect(C.DB_PATH)
        c.row_factory = sqlite3.Row
        try:
            yield c
            c.commit()
        finally:
            c.close()


def init():
    with conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS applications(
            id TEXT PRIMARY KEY, request_id TEXT UNIQUE, input_hash TEXT,
            input_json TEXT, result_json TEXT, model_version TEXT, created_at TEXT);
        CREATE TABLE IF NOT EXISTS explanations(
            app_id TEXT, lang TEXT, json TEXT, PRIMARY KEY(app_id, lang));
        CREATE TABLE IF NOT EXISTS reviews(
            app_id TEXT PRIMARY KEY, final_decision TEXT, note TEXT,
            reviewer TEXT, created_at TEXT);
        CREATE INDEX IF NOT EXISTS idx_app_created ON applications(created_at);
        """)


def count() -> int:
    with conn() as c:
        return c.execute("SELECT COUNT(*) FROM applications").fetchone()[0]


def input_hash(payload: dict) -> str:
    clean = {k: v for k, v in payload.items() if k != "request_id"}
    return hashlib.sha256(json.dumps(clean, sort_keys=True).encode()).hexdigest()[:16]


def _with_review(c, result: dict) -> dict:
    r = c.execute("SELECT final_decision, note, reviewer, created_at FROM reviews WHERE app_id=?",
                  (result["id"],)).fetchone()
    review = dict(r) if r else None
    result["review"] = review
    if review:
        word = "Approved" if review["final_decision"] == "APPROVE" else "Declined"
        overridden = review["final_decision"] != result["decision"]
        result["status"] = f"{word} after review" + (" (override)" if overridden and result["decision"] != "REFER" else "")
    else:
        result["status"] = STATUS[result["decision"]]
    return result


def _rows(sql: str, args=()):
    with conn() as c:
        return [_with_review(c, json.loads(r["result_json"])) for r in c.execute(sql, args).fetchall()]


def by_request(request_id: str):
    rows = _rows("SELECT result_json FROM applications WHERE request_id=?", (request_id,))
    return rows[0] if rows else None


def save(app_id, request_id, payload, result, version, created_at):
    with conn() as c:
        c.execute("INSERT INTO applications VALUES(?,?,?,?,?,?,?)",
                  (app_id, request_id, input_hash(payload), json.dumps(payload),
                   json.dumps(result), version, created_at))


def get(app_id: str):
    rows = _rows("SELECT result_json FROM applications WHERE id=?", (app_id,))
    return rows[0] if rows else None


def recent(limit: int = 20, decision: str | None = None, status: str | None = None):
    rows = _rows("SELECT result_json FROM applications ORDER BY created_at DESC")
    if decision:
        rows = [r for r in rows if r["decision"] == decision]
    if status:
        rows = [r for r in rows if r["status"] == status]
    return rows[:limit]


def review_queue():
    rows = _rows("SELECT result_json FROM applications ORDER BY created_at ASC")
    return [r for r in rows if r["decision"] == "REFER" and not r["review"]]


def save_review(app_id: str, final_decision: str, note: str, reviewer: str, created_at: str | None = None):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO reviews VALUES(?,?,?,?,?)",
                  (app_id, final_decision, note, reviewer,
                   created_at or datetime.now(timezone.utc).isoformat()))


def cached_explanation(app_id: str, lang: str):
    with conn() as c:
        r = c.execute("SELECT json FROM explanations WHERE app_id=? AND lang=?", (app_id, lang)).fetchone()
    return json.loads(r["json"]) if r else None


def cache_explanation(app_id: str, lang: str, data: dict):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO explanations VALUES(?,?,?)", (app_id, lang, json.dumps(data)))


def _band(score: int) -> str:
    for lo, hi in [(300, 549), (550, 599), (600, 649), (650, 699), (700, 749), (750, 900)]:
        if lo <= score <= hi:
            return f"{lo}-{hi}"
    return "other"


def stats(days: int = 14) -> dict:
    """Everything the dashboard shows, computed from the audit log."""
    rows = _rows("SELECT result_json FROM applications ORDER BY created_at ASC")
    total = len(rows)
    by_dec = Counter(r["decision"] for r in rows)
    today = datetime.now(timezone.utc).date()
    daily = {(today - timedelta(days=i)).isoformat(): {"APPROVE": 0, "REFER": 0, "DECLINE": 0}
             for i in range(days - 1, -1, -1)}
    reasons, bands = Counter(), defaultdict(lambda: Counter())
    cibils, foirs, reviewed, overrides = [], [], 0, 0
    for r in rows:
        d = r["created_at"][:10]
        if d in daily:
            daily[d][r["decision"]] += 1
        a = r.get("application") or {}
        if a.get("cibil_score"):
            cibils.append(a["cibil_score"])
            bands[_band(a["cibil_score"])][r["decision"]] += 1
        foirs.append(r["foir"])
        for chk in r["rule_checks"]:
            if chk["status"] != "pass":
                reasons[chk["label"]] += 1
        if "outside_training_range" in r["flags"]:
            reasons["Outside training data"] += 1
        if "model_policy_conflict" in r["flags"]:
            reasons["Model and policy disagree"] += 1
        if r["review"]:
            reviewed += 1
            overrides += r["review"]["final_decision"] != r["decision"] and r["decision"] != "REFER"
    band_rows = []
    for b in ["300-549", "550-599", "600-649", "650-699", "700-749", "750-900"]:
        n = sum(bands[b].values())
        band_rows.append({"band": b, "count": n,
                          "approve_rate": round(bands[b]["APPROVE"] / n, 3) if n else 0})
    return {
        "total": total,
        "by_decision": {k: by_dec.get(k, 0) for k in ("APPROVE", "REFER", "DECLINE")},
        "approval_rate": round(by_dec.get("APPROVE", 0) / total, 3) if total else 0,
        "awaiting_review": sum(1 for r in rows if r["decision"] == "REFER" and not r["review"]),
        "reviewed": reviewed,
        "overrides": int(overrides),
        "avg_cibil": round(sum(cibils) / len(cibils)) if cibils else None,
        "avg_foir": round(sum(foirs) / len(foirs), 3) if foirs else None,
        "daily": [{"date": k, **v} for k, v in daily.items()],
        "attention_reasons": [{"reason": k, "count": v} for k, v in reasons.most_common(6)],
        "cibil_bands": band_rows,
    }
