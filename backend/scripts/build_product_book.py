"""Writes docs/PRODUCT_BOOK.md from app/products.json, so the document and the app never disagree.
Run from backend/:  python scripts/build_product_book.py"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
book = json.loads((ROOT / "app" / "products.json").read_text(encoding="utf-8"))
EMP = {"salaried": "Salaried", "government": "Government", "self_employed": "Self-employed", "pensioner": "Pensioner"}
rs = lambda n: "₹" + format(int(n), ",") if n < 100000 else f"₹{n / 100000:g} lakh" if n < 10000000 else f"₹{n / 10000000:g} crore"

lines = ["# Product book", "", "Patrata screens **4 products and 9 variants**. Each variant has its own rules, compiled from",
         "lenders' published eligibility pages and RBI rules. ‡ marks Patrata's own policy assumption where no single",
         "published figure exists. Generated from `backend/app/products.json`.", "",
         f"> {book['note']}", ""]
for p in book["products"]:
    lines += [f"## {p['name']} ({'secured' if p['secured'] else 'unsecured'})", "", p["summary"], ""]
    for v in p["variants"]:
        c, a = v["criteria"], set(v["assumptions"])
        mark = lambda k: " ‡" if k in a else ""
        age = c["age_max_at_maturity"]
        age = ", ".join(f"{EMP[k]} {x}" for k, x in age.items()) if isinstance(age, dict) else age
        inc = f"{rs(c['min_monthly_income'])} a month" if "min_monthly_income" in c else f"{rs(c['min_annual_income'])} a year"
        ik = "min_monthly_income" if "min_monthly_income" in c else "min_annual_income"
        rows = [("Who can apply", ", ".join(EMP[e] for e in c["employment"])),
                ("Age", f"{c['age_min']}+ today{mark('age_min')}; at most {age} when the loan ends"),
                ("Minimum income", inc + mark(ik)), ("Job or business years", f"{c['min_years_in_job']:g}+{mark('min_years_in_job')}"),
                ("CIBIL", f"{c['cibil_clear']}+ clear, {c['cibil_min']} minimum{mark('cibil_min')}"),
                ("EMI burden (FOIR)", f"up to {c['foir_clear'] * 100:g}% clear, {c['foir_max'] * 100:g}% maximum{mark('foir_max')}"),
                ("Amount", f"{rs(c['amount_min'])} to {rs(c['amount_max'])}{mark('amount_max') or mark('amount_min')}"),
                ("Tenure", f"{c['tenure_months_min']} to {c['tenure_months_max']} months")]
        if c.get("ltv") == "rbi_home":
            rows.append(("Loan-to-value", "RBI: 90% up to ₹30 lakh, 80% for ₹30 to 75 lakh, 75% above"))
        if c.get("ltv") == "asset":
            rows.append(("Funding", f"up to {c['max_ltv'] * 100:g}% of the price{mark('max_ltv')}"))
        rr = c["rate_range"]
        rows.append(("Indicative rate", ("0% (paid by the brand or store)" if rr == [0, 0] else f"{rr[0]}% to {rr[1]}% a year") + mark("rate_range")))
        lines += [f"### {v['name']}", "", f"**For:** {v['for']}", "", f"**Features:** {'; '.join(v['features'])}.", "",
                  "| Rule | Value |", "|---|---|"] + [f"| {k} | {val} |" for k, val in rows] + [""]
        if v.get("special"):
            lines += [f"**Special rule:** {v['special']['rule']}", ""]
        lines += [f"**Documents:** {', '.join(v['documents'])}.", "", "**Sources:**"] + \
                 [f"- [{s['label']}]({s['url']})" for s in v["sources"]] + [""]
lines += ["## How every variant is checked", "",
          "1. Employment type allowed  2. Age today  3. Age when the loan ends  4. Minimum income  5. Job or business years",
          "6. CIBIL (first-time borrowers are referred, never declined only for no history)  7. EMI burden on the EMI the",
          "variant really charges  8. Amount limits  9. Tenure limits  10. Loan-to-value (home: RBI caps; vehicle and consumer:",
          "share of price)  11. Repayment risk from the model trained on 307,511 real loans.", "",
          "Any **fail** declines the application; any **review** sends it to a credit officer; all **pass** approves it",
          "(when the approval model is used, it must also agree)."]
(ROOT.parent / "docs" / "PRODUCT_BOOK.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("wrote docs/PRODUCT_BOOK.md")
