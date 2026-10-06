import { useState, useEffect, useCallback } from "react";
import type { ModelCardResponse, ModelDetails } from "../types";
import { getModelCard } from "../api";
import { formatINR, formatPct } from "../utils";
import { ErrorBox, LoadingSkeleton } from "./ui";

const DECISION_FLOW_STEPS = [
  {
    step: 1,
    title: "Form",
    desc: "Applicant enters loan requirements, employment, income, credit, and asset details.",
  },
  {
    step: 2,
    title: "Validation",
    desc: "Checks completeness, numeric ranges, and product-specific field constraints.",
  },
  {
    step: 3,
    title: "Policy rules",
    desc: "Hard eligibility rules check age limits, FOIR capacity, CIBIL thresholds, and overdue status.",
  },
  {
    step: 4,
    title: "ML models",
    desc: "Supervised models calculate statistical approval likelihood and default risk probability.",
  },
  {
    step: 5,
    title: "Decision",
    desc: "Combines policy checks and model predictions to assign Approve, Refer, or Decline status.",
  },
  {
    step: 6,
    title: "AI explanation (never decides)",
    desc: "Synthesizes rationale into plain-language summaries and answers questions without changing decisions.",
  },
  {
    step: 7,
    title: "Credit officer",
    desc: "Human credit manager reviews referred cases and makes the final binding lending decision.",
  },
];

function formatPolicyKey(key: string): string {
  const acronyms: Record<string, string> = {
    cibil: "CIBIL",
    emi: "EMI",
    foir: "FOIR",
    inr: "INR",
    ml: "ML",
    llm: "LLM",
    id: "ID",
    ltv: "LTV",
  };
  return key
    .split("_")
    .map((w) => acronyms[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function formatPolicyValue(key: string, val: unknown): string {
  if (val == null || val === "") return "—";
  if (typeof val === "number") {
    const lk = key.toLowerCase();
    if (lk.includes("foir") || lk.includes("rate") || lk.includes("pct") || lk.includes("ratio")) {
      return val <= 1 && val > 0 ? formatPct(val) : `${val}%`;
    }
    if (
      lk.includes("amount") ||
      lk.includes("income") ||
      lk.includes("debt") ||
      lk.includes("value") ||
      lk.includes("price") ||
      lk.includes("emi")
    ) {
      return formatINR(val);
    }
    if (lk.includes("months") || lk.includes("tenure")) {
      return `${val} months`;
    }
    if (lk.includes("years") || lk.includes("age")) {
      return `${val} years`;
    }
    return val.toLocaleString("en-IN");
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : "—";
  return String(val);
}

function formatAccuracy(evalData?: ModelCardResponse["assistant_retrieval_eval"]): string {
  if (!evalData) return "—";
  const e = evalData as Record<string, unknown>;
  const total = Number(e.questions ?? e.total_questions ?? 0);
  const hits = e.top1_hits;
  if (typeof hits === "number" && total > 0) return `${Math.round((hits / total) * 100)}% (${hits}/${total})`;
  const acc = e.accuracy;
  if (typeof acc === "number") return acc <= 1 ? `${Math.round(acc * 100)}%` : `${Math.round(acc)}%`;
  return "—";
}

function ModelItemCard({
  title,
  model,
}: {
  title: string;
  model?: ModelDetails | null;
}) {
  const dataSource = model?.data_source || "—";
  const rows =
    model?.training_rows != null
      ? model.training_rows.toLocaleString("en-IN")
      : model?.rows != null
      ? model.rows.toLocaleString("en-IN")
      : "—";
  const version = model?.model_version || "—";
  const rocAuc = model?.metrics?.roc_auc;
  const lrRocAuc = model?.metrics?.logistic_regression_roc_auc;

  const rocAucPct =
    rocAuc != null ? (rocAuc <= 1 ? rocAuc * 100 : rocAuc) : null;
  const lrRocAucPct =
    lrRocAuc != null ? (lrRocAuc <= 1 ? lrRocAuc * 100 : lrRocAuc) : null;

  return (
    <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-archivo font-700 text-base text-ink">{title}</h3>
        {version !== "—" && (
          <span className="rounded-md bg-page border border-cardborder px-2 py-0.5 text-xs font-600 text-muted">
            v{version}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm border-t border-cardborder pt-3">
        <div>
          <p className="text-xs text-muted">Data source</p>
          <p className="mt-0.5 font-600 text-ink truncate" title={dataSource}>
            {dataSource}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Training rows</p>
          <p className="mt-0.5 font-archivo font-700 text-ink">{rows}</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs text-muted">Model version</p>
          <p className="mt-0.5 font-600 text-ink">{version}</p>
        </div>
      </div>

      {/* ROC-AUC Comparison Bars */}
      <div className="border-t border-cardborder pt-3 space-y-3">
        <p className="text-xs font-600 text-muted">Performance (ROC-AUC)</p>

        {/* Model ROC-AUC */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-600 text-ink">Model ROC-AUC</span>
            <span className="font-archivo font-700 text-ink">
              {rocAuc != null ? (rocAuc <= 1 ? rocAuc.toFixed(3) : (rocAuc / 100).toFixed(3)) : "—"}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-page overflow-hidden">
            <div
              className="h-full bg-approve rounded-full transition-all"
              style={{ width: `${rocAucPct != null ? Math.min(Math.max(rocAucPct, 5), 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Logistic Regression Baseline */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted">Logistic regression baseline</span>
            <span className="font-archivo font-600 text-muted">
              {lrRocAuc != null ? (lrRocAuc <= 1 ? lrRocAuc.toFixed(3) : (lrRocAuc / 100).toFixed(3)) : "—"}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-page overflow-hidden">
            <div
              className="h-full bg-muted/60 rounded-full transition-all"
              style={{ width: `${lrRocAucPct != null ? Math.min(Math.max(lrRocAucPct, 5), 100) : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelCard() {
  const [data, setData] = useState<ModelCardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getModelCard();
      setData(res);
    } catch {
      setError("Could not load model card details. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="rounded-card border border-cardborder bg-white p-6">
        <LoadingSkeleton label="Loading model card specifications…" />
      </div>
    );
  }

  if (error) {
    return <ErrorBox message={error} onRetry={loadData} />;
  }

  const approvalModel = data?.approval_v2 ?? data?.models?.approval_v2 ?? null;
  const riskModel = data?.risk_model ?? data?.models?.risk_model ?? null;
  const llm = data?.llm;
  const policyObj = data?.policy ?? data?.policy_thresholds ?? null;
  const policyEntries = policyObj ? Object.entries(policyObj) : [];
  const limitations = data?.limitations;
  const accuracyStr = formatAccuracy(data?.assistant_retrieval_eval);

  return (
    <div className="space-y-5">
      {/* Overview Card */}
      <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6">
        <h2 className="font-archivo font-700 text-lg text-ink">Model Architecture & Card</h2>
        <p className="mt-0.5 text-sm text-muted">
          Transparent technical overview of policies, ML models, and LLM boundaries
        </p>
      </div>

      {/* 1. How a decision is made */}
      <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6">
        <h3 className="font-archivo font-700 text-base text-ink">1. How a decision is made</h3>
        <p className="mt-1 text-xs text-muted">
          Vertical decision pipeline and governance flow
        </p>

        <div className="mt-5 relative">
          <div className="space-y-3">
            {DECISION_FLOW_STEPS.map((item, idx) => (
              <div key={item.step} className="relative flex items-start gap-3.5">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-700 text-white shadow-sm">
                    {item.step}
                  </div>
                  {idx < DECISION_FLOW_STEPS.length - 1 && (
                    <div className="h-6 w-0.5 bg-cardborder my-0.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5 pb-2">
                  <h4 className="text-sm font-700 text-ink leading-none">{item.title}</h4>
                  <p className="mt-1 text-xs text-muted leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Models */}
      <div className="space-y-3">
        <h3 className="font-archivo font-700 text-base text-ink px-1">2. Machine learning models</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <ModelItemCard title="Approval Model (approval_v2)" model={approvalModel} />
          <ModelItemCard title="Default Risk Model (risk_model)" model={riskModel} />
        </div>
      </div>

      {/* 3. AI language model */}
      <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-4">
        <h3 className="font-archivo font-700 text-base text-ink">3. AI language model</h3>
        <div className="grid gap-3 sm:grid-cols-2 border-t border-cardborder pt-3 text-sm">
          <div>
            <p className="text-xs text-muted">Provider</p>
            <p className="mt-0.5 font-600 text-ink">{llm?.provider || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Model</p>
            <p className="mt-0.5 font-600 text-ink">{llm?.model || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Role</p>
            <p className="mt-0.5 text-xs text-ink leading-relaxed">
              {llm?.role || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Data sent</p>
            <p className="mt-0.5 text-xs text-ink leading-relaxed">
              {llm?.data_sent || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Assistant accuracy */}
      <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6">
        <h3 className="font-archivo font-700 text-base text-ink">4. Assistant accuracy</h3>
        <p className="mt-0.5 text-xs text-muted">Top-1 retrieval evaluation across benchmarks</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="rounded-card border border-cardborder bg-page px-5 py-3 text-center">
            <p className="font-archivo font-800 text-2xl text-brand">{accuracyStr}</p>
            <p className="text-[11px] font-600 text-muted mt-0.5">Top-1 Hits</p>
          </div>
          <div className="text-xs text-muted leading-relaxed flex-1">
            <p className="font-600 text-ink">Retrieval Benchmark</p>
            <p className="mt-0.5">
              Percentage of questions where the relevant policy guideline or documentation was retrieved as the primary context.
            </p>
          </div>
        </div>
      </div>

      {/* 5. Policy thresholds */}
      <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6">
        <h3 className="font-archivo font-700 text-base text-ink">5. Policy thresholds</h3>
        <p className="mt-0.5 text-xs text-muted">Configured operational limits and risk cutoff values</p>

        {policyEntries.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No policy thresholds specified.</p>
        ) : (
          <div className="mt-4 rounded-btn border border-cardborder overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cardborder bg-page">
                  <th className="px-4 py-2.5 text-left text-xs font-600 text-muted">Rule / Metric</th>
                  <th className="px-4 py-2.5 text-right text-xs font-600 text-muted">Threshold Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cardborder">
                {policyEntries.map(([k, v]) => (
                  <tr key={k} className="hover:bg-page/40 transition-colors">
                    <td className="px-4 py-2.5 font-500 text-ink">{formatPolicyKey(k)}</td>
                    <td className="px-4 py-2.5 text-right font-archivo font-600 text-ink">
                      {formatPolicyValue(k, v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Limitations */}
      <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6">
        <h3 className="font-archivo font-700 text-base text-ink">6. Limitations</h3>
        <p className="mt-0.5 text-xs text-muted">Operational caveats and model constraints</p>

        {limitations && limitations.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {limitations.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm text-ink leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">—</p>
        )}
      </div>
    </div>
  );
}
