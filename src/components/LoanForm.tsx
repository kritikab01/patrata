import { useState, useMemo, useEffect, useRef } from "react";
import type { Product, FormState, EmploymentType, SimulateResult, ScoreBody } from "../types";
import { num } from "../utils";
import { Icon, Meter, type IconName } from "./viz";
import { inr, inWords, emi } from "../lib/calc";
import { getConsent, saveConsent } from "../lib/storage";
import { postSimulate } from "../api";

export const SAMPLE_APPLICANT: FormState = {
  product: "personal",
  variant: "pl_salaried",
  age: "32",
  no_of_dependents: "1",
  employment_type: "salaried",
  years_in_job: "5",
  income_annum: "1200000",
  existing_emi_monthly: "8000",
  loan_amount: "500000",
  property_value: "",
  asset_price: "",
  tenure_months: "36",
  annual_rate: "12",
  cibil_score: "760",
  no_credit_history: false,
  existing_loans_count: "1",
  outstanding_debt: "120000",
  credit_history_years: "8",
  new_loans_12m: "0",
  overdue_now: false,
  residential_assets_value: "3500000",
  commercial_assets_value: "0",
  luxury_assets_value: "500000",
  bank_asset_value: "200000",
};

export const BORDERLINE_APPLICANT: FormState = {
  ...SAMPLE_APPLICANT,
  cibil_score: "690",
};

export const EMPTY_FORM: FormState = {
  product: "",
  variant: "",
  age: "",
  no_of_dependents: "0",
  employment_type: "salaried",
  years_in_job: "0",
  income_annum: "",
  existing_emi_monthly: "0",
  loan_amount: "",
  property_value: "",
  asset_price: "",
  tenure_months: "",
  annual_rate: "",
  cibil_score: "750",
  no_credit_history: false,
  existing_loans_count: "0",
  outstanding_debt: "0",
  credit_history_years: "0",
  new_loans_12m: "0",
  overdue_now: false,
  residential_assets_value: "0",
  commercial_assets_value: "0",
  luxury_assets_value: "0",
  bank_asset_value: "0",
};

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "salaried", label: "Salaried" },
  { value: "self_employed", label: "Self-employed" },
  { value: "government", label: "Government" },
  { value: "pensioner", label: "Pensioner" },
  { value: "not_employed", label: "Not employed" },
];

export type ValidationErrors = Record<string, string>;

export function validateForm(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!form.product) errors.product = "Select a loan product";
  if (!form.variant) errors.variant = "Select a loan variant";

  const age = num(form.age);
  if (!form.age) errors.age = "Age is required";
  else if (age < 18 || age > 75) errors.age = "Age must be between 18 and 75";

  if (!form.income_annum) errors.income_annum = "Annual income is required";
  else if (num(form.income_annum) < 0) errors.income_annum = "Income must be 0 or more";

  if (!form.loan_amount) errors.loan_amount = "Loan amount is required";
  else if (num(form.loan_amount) < 0) errors.loan_amount = "Amount must be 0 or more";

  const product = form.product;
  if (product === "home") {
    if (!form.property_value) errors.property_value = "Property value is required";
    else if (num(form.property_value) < 0) errors.property_value = "Must be 0 or more";
  }
  if (product === "consumer" || product === "vehicle") {
    if (!form.asset_price) errors.asset_price = "Asset / On-road price is required";
    else if (num(form.asset_price) < 0) errors.asset_price = "Must be 0 or more";
  }

  const tenure = num(form.tenure_months);
  if (!form.tenure_months) errors.tenure_months = "Tenure is required";
  else if (tenure < 6 || tenure > 360) errors.tenure_months = "Tenure must be 6–360 months";

  if (!form.annual_rate) errors.annual_rate = "Interest rate is required";
  else if (num(form.annual_rate) < 0) errors.annual_rate = "Must be 0 or more";

  if (!form.no_credit_history && form.cibil_score) {
    const cibil = num(form.cibil_score);
    if (cibil < 300 || cibil > 900) errors.cibil_score = "CIBIL must be between 300 and 900";
  }

  return errors;
}

export function validateStep(step: 1 | 2 | 3, form: FormState): ValidationErrors {
  const full = validateForm(form);
  const stepErrors: ValidationErrors = {};

  if (step === 1) {
    if (full.product) stepErrors.product = full.product;
    if (full.variant) stepErrors.variant = full.variant;
    if (full.loan_amount) stepErrors.loan_amount = full.loan_amount;
    if (full.property_value) stepErrors.property_value = full.property_value;
    if (full.asset_price) stepErrors.asset_price = full.asset_price;
    if (full.tenure_months) stepErrors.tenure_months = full.tenure_months;
    if (full.annual_rate) stepErrors.annual_rate = full.annual_rate;
  } else if (step === 2) {
    if (full.age) stepErrors.age = full.age;
    if (full.income_annum) stepErrors.income_annum = full.income_annum;
    if (full.existing_emi_monthly) stepErrors.existing_emi_monthly = full.existing_emi_monthly;
    if (full.employment_type) stepErrors.employment_type = full.employment_type;
    if (full.years_in_job) stepErrors.years_in_job = full.years_in_job;
  } else if (step === 3) {
    if (full.cibil_score) stepErrors.cibil_score = full.cibil_score;
  }

  return stepErrors;
}

export function getStepForField(field: string): 1 | 2 | 3 {
  if (
    [
      "product",
      "variant",
      "loan_amount",
      "property_value",
      "asset_price",
      "tenure_months",
      "annual_rate",
    ].includes(field)
  ) {
    return 1;
  }
  if (
    [
      "age",
      "no_of_dependents",
      "employment_type",
      "years_in_job",
      "income_annum",
      "existing_emi_monthly",
    ].includes(field)
  ) {
    return 2;
  }
  return 3;
}

const AMOUNT_RANGES = [
  { id: "0-1L", label: "0–1L", min: 25000, max: 100000, defaultVal: 75000 },
  { id: "1-3L", label: "1–3L", min: 100000, max: 300000, defaultVal: 200000 },
  { id: "3-5L", label: "3–5L", min: 300000, max: 500000, defaultVal: 400000 },
  { id: "5-10L", label: "5–10L", min: 500000, max: 1000000, defaultVal: 750000 },
  { id: "10L+", label: "10L+", min: 1000000, max: 10000000, defaultVal: 2500000 },
];

/* Sensible starting values per product, clamped to the chosen variant's limits. */
const PRODUCT_DEFAULTS: Record<string, { amount: number; months: number }> = {
  personal: { amount: 500000, months: 36 },
  home: { amount: 3000000, months: 240 },
  consumer: { amount: 50000, months: 12 },
  vehicle: { amount: 800000, months: 60 },
};

function Stepper({
  value,
  onChange,
  min = 0,
  max = 20,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  id?: string;
}) {
  return (
    <div id={id} className="inline-flex items-center rounded-btn border border-cardborder bg-white p-1">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-page text-ink hover:bg-cardborder disabled:opacity-30 disabled:pointer-events-none text-base font-bold transition-colors"
      >
        −
      </button>
      <span className="w-12 text-center font-archivo font-bold text-base text-ink">
        {value}
      </span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-page text-ink hover:bg-cardborder disabled:opacity-30 disabled:pointer-events-none text-base font-bold transition-colors"
      >
        +
      </button>
    </div>
  );
}

export function LoanForm({
  products,
  form,
  errors,
  apiErrors,
  onChange,
  onLoadSample,
  onLoadBorderline,
  onStartOver,
  onSubmit,
  submitting,
  onBackToHome,
}: {
  products: Product[];
  form: FormState;
  errors: ValidationErrors;
  apiErrors: Record<string, string>;
  onChange: (field: keyof FormState, value: unknown) => void;
  onLoadSample?: () => void;
  onLoadBorderline?: () => void;
  onStartOver?: () => void;
  onSubmit: () => void;
  submitting: boolean;
  onBackToHome?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showAssets, setShowAssets] = useState(false);
  const [savedDraftToast, setSavedDraftToast] = useState(false);
  const [consent, setConsent] = useState(getConsent);

  // Live simulation state
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simIs422, setSimIs422] = useState(false);

  const [localErrors, setLocalErrors] = useState<ValidationErrors>({});

  const fieldErrors: Record<string, string> = useMemo(
    () => ({ ...errors, ...localErrors, ...apiErrors }),
    [errors, localErrors, apiErrors]
  );

  // Messages shown in the banner above the buttons (covers errors on fields that are not visible).
  const errorMessages = useMemo(
    () => Array.from(new Set(Object.values(fieldErrors).filter(Boolean))),
    [fieldErrors]
  );

  // Once the user fixes a field, drop its local error.
  useEffect(() => {
    if (Object.keys(localErrors).length === 0) return;
    const full = validateForm(form);
    const next: ValidationErrors = {};
    for (const k of Object.keys(localErrors)) if (full[k]) next[k] = full[k];
    if (Object.keys(next).length !== Object.keys(localErrors).length) setLocalErrors(next);
  }, [form, localErrors]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Active product & variant details
  const activeProduct = useMemo(
    () => products.find((p) => p.id === form.product) || products[0],
    [products, form.product]
  );

  const variants = useMemo(() => activeProduct?.variants || [], [activeProduct]);

  const activeVariant = useMemo(() => {
    return variants.find((v) => v.id === form.variant) || variants[0];
  }, [variants, form.variant]);

  // Variant criteria
  const criteria = useMemo(() => {
    return (activeVariant?.criteria || {}) as Record<string, unknown>;
  }, [activeVariant]);

  const variantAmountMin = typeof criteria.amount_min === "number" ? criteria.amount_min : 25000;
  const variantAmountMax = typeof criteria.amount_max === "number" ? criteria.amount_max : 10000000;
  const rateRange = (Array.isArray(criteria.rate_range) ? criteria.rate_range : [9.5, 16.5]) as [number, number];

  // Current loan amount & range chip selection
  const currentAmountNum = num(form.loan_amount);

  const currentRangeId = useMemo(() => {
    if (currentAmountNum <= 100000) return "0-1L";
    if (currentAmountNum <= 300000) return "1-3L";
    if (currentAmountNum <= 500000) return "3-5L";
    if (currentAmountNum <= 1000000) return "5-10L";
    return "10L+";
  }, [currentAmountNum]);

  const selectedRangeObj = useMemo(() => {
    return AMOUNT_RANGES.find((r) => r.id === currentRangeId) || AMOUNT_RANGES[2];
  }, [currentRangeId]);

  // Only offer range chips that overlap this variant's allowed amounts.
  const visibleRanges = useMemo(
    () => AMOUNT_RANGES.filter((r) => r.max > variantAmountMin && r.min < variantAmountMax),
    [variantAmountMin, variantAmountMax]
  );
  let sliderMin = Math.max(selectedRangeObj.min, variantAmountMin);
  let sliderMax = Math.min(selectedRangeObj.id === "10L+" ? variantAmountMax : selectedRangeObj.max, variantAmountMax);
  if (sliderMin >= sliderMax) {
    sliderMin = variantAmountMin;
    sliderMax = variantAmountMax;
  }

  // Auto-jump to step on engine 422 errors
  useEffect(() => {
    const errorKeys = Object.keys(apiErrors);
    if (errorKeys.length > 0) {
      const targetStep = getStepForField(errorKeys[0]);
      setStep(targetStep);
      setTimeout(() => {
        const el =
          document.querySelector(`[name="${errorKeys[0]}"]`) ||
          document.querySelector(`#field-${errorKeys[0]}`);
        if (el && typeof (el as HTMLElement).focus === "function") {
          (el as HTMLElement).focus();
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  }, [apiErrors]);

  // Live simulation: debounced 500ms
  useEffect(() => {
    const loanAmt = num(form.loan_amount);
    const tenureMonths = num(form.tenure_months);
    const annualRate = num(form.annual_rate);
    const income = num(form.income_annum);

    if (loanAmt <= 0 || tenureMonths <= 0 || annualRate <= 0 || !form.product) {
      setSimResult(null);
      setSimIs422(false);
      return;
    }

    const timer = setTimeout(() => {
      setSimLoading(true);
      const cibilVal = form.no_credit_history ? null : form.cibil_score ? num(form.cibil_score) : null;
      const simBody: ScoreBody = {
        variant: form.variant,
        request_id: `sim_${Date.now()}`,
        product: form.product,
        product_id: form.product,
        age: num(form.age) || 30,
        no_of_dependents: num(form.no_of_dependents),
        employment_type: form.employment_type || "salaried",
        years_in_job: num(form.years_in_job) || 3,
        income_annum: income || 600000,
        existing_emi_monthly: num(form.existing_emi_monthly),
        loan_amount: loanAmt,
        property_value: form.product === "home" ? num(form.property_value) || loanAmt * 1.3 : null,
        asset_price:
          form.product === "consumer" || form.product === "vehicle"
            ? num(form.asset_price) || loanAmt * 1.2
            : null,
        loan_term: tenureMonths / 12,
        annual_rate: annualRate,
        cibil_score: cibilVal,
        no_credit_history: form.no_credit_history,
        existing_loans_count: num(form.existing_loans_count),
        outstanding_debt: num(form.outstanding_debt),
        credit_history_years: num(form.credit_history_years) || 5,
        new_loans_12m: num(form.new_loans_12m),
        overdue_now: form.overdue_now,
        residential_assets_value: num(form.residential_assets_value),
        commercial_assets_value: num(form.commercial_assets_value),
        luxury_assets_value: num(form.luxury_assets_value),
        bank_asset_value: num(form.bank_asset_value),
      };

      postSimulate(simBody)
        .then((res) => {
          setSimResult(res);
          setSimIs422(false);
        })
        .catch((err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 422) {
            setSimIs422(true);
            setSimResult(null);
          } else {
            setSimIs422(false);
          }
        })
        .finally(() => setSimLoading(false));
    }, 500);

    return () => clearTimeout(timer);
  }, [form]);

  // Current estimated EMI for live card
  const estimatedEmi = useMemo(() => {
    const loanAmt = num(form.loan_amount);
    const rate = num(form.annual_rate);
    const months = num(form.tenure_months);
    if (loanAmt > 0 && months > 0) {
      return emi(loanAmt, rate, months);
    }
    return 0;
  }, [form.loan_amount, form.annual_rate, form.tenure_months]);

  // Product selection handler
  // Fill amount, tenure, rate (and property / asset value) so the shown values are the sent values.
  function applyVariantDefaults(prodId: string, v: { criteria: unknown } | undefined, clampOnly = false) {
    const c = (v?.criteria || {}) as Record<string, unknown>;
    const aMin = typeof c.amount_min === "number" ? c.amount_min : 25000;
    const aMax = typeof c.amount_max === "number" ? c.amount_max : 10000000;
    const tMin = typeof c.tenure_months_min === "number" ? c.tenure_months_min : 6;
    const tMax = typeof c.tenure_months_max === "number" ? c.tenure_months_max : 360;
    const rr = Array.isArray(c.rate_range) ? (c.rate_range as number[]) : null;
    const pref = PRODUCT_DEFAULTS[prodId] || PRODUCT_DEFAULTS.personal;
    const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

    const curAmt = num(form.loan_amount);
    const amt = clampOnly && curAmt > 0 ? clamp(curAmt, aMin, aMax) : clamp(pref.amount, aMin, aMax);
    onChange("loan_amount", String(amt));

    const curMonths = num(form.tenure_months);
    const months = clampOnly && curMonths > 0 ? clamp(curMonths, tMin, tMax) : clamp(pref.months, tMin, tMax);
    onChange("tenure_months", String(months));

    if (rr && (!clampOnly || !form.annual_rate)) {
      const rate = rr[1] === 0 ? 0 : Math.min(Math.round((rr[0] + 1.5) * 10) / 10, rr[1]);
      onChange("annual_rate", String(rate));
    }
    if (prodId === "home" && (!clampOnly || !form.property_value)) {
      onChange("property_value", String(Math.round(amt / 0.75 / 10000) * 10000));
    }
    if ((prodId === "vehicle" || prodId === "consumer") && (!clampOnly || !form.asset_price)) {
      onChange("asset_price", String(Math.round(amt / 0.85 / 1000) * 1000));
    }
  }

  function handleSelectProduct(prodId: string) {
    onChange("product", prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod && prod.variants.length > 0) {
      onChange("variant", prod.variants[0].id);
      applyVariantDefaults(prodId, prod.variants[0]);
    }
  }

  // The first product looks selected on screen, so make it selected in the data too.
  // Also fill any empty amount / tenure / rate (e.g. when another screen pre-selected the product).
  useEffect(() => {
    if (products.length === 0) return;
    if (!form.product) {
      handleSelectProduct(products[0].id);
      return;
    }
    if (!form.loan_amount || !form.tenure_months || form.annual_rate === "") {
      const prod = products.find((p) => p.id === form.product) || products[0];
      const v = prod.variants.find((x) => x.id === form.variant) || prod.variants[0];
      if (!v) return;
      if (form.variant !== v.id) onChange("variant", v.id);
      applyVariantDefaults(prod.id, v, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, form.product, form.variant]);

  // Range chip selection handler
  function handleRangeChipSelect(rangeId: string) {
    const r = AMOUNT_RANGES.find((x) => x.id === rangeId);
    if (!r) return;
    const lo = Math.max(r.min, variantAmountMin);
    const hi = Math.min(r.id === "10L+" ? variantAmountMax : r.max, variantAmountMax);
    const clamped = lo < hi ? Math.min(Math.max(r.defaultVal, lo), hi) : variantAmountMin;
    onChange("loan_amount", String(clamped));
  }

  // Navigation between steps with validation
  function handleNext(targetStep: 2 | 3) {
    const stepErrors = validateStep(step, form);
    setLocalErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      const firstField = Object.keys(stepErrors)[0];
      const el =
        document.querySelector(`[name="${firstField}"]`) ||
        document.querySelector(`#field-${firstField}`);
      if (el && typeof (el as HTMLElement).focus === "function") {
        (el as HTMLElement).focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Validate every step before sending; if something is missing, go to that step and say what.
  function handleSubmitClick() {
    const full = validateForm(form);
    if (Object.keys(full).length > 0) {
      setLocalErrors(full);
      const first = Object.keys(full)[0];
      setStep(getStepForField(first));
      setTimeout(() => {
        const el = document.querySelector(`[name="${first}"]`) || document.querySelector(`#field-${first}`);
        if (el && typeof (el as HTMLElement).focus === "function") {
          (el as HTMLElement).focus();
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 120);
      return;
    }
    setLocalErrors({});
    onSubmit();
  }

  function handleSaveDraft() {
    setSavedDraftToast(true);
    setTimeout(() => setSavedDraftToast(false), 2500);
  }

  const getProductIcon = (id: string): IconName => {
    const lk = id.toLowerCase();
    if (lk.includes("home") || lk.includes("house")) return "house";
    if (lk.includes("car") || lk.includes("vehicle")) return "car";
    if (lk.includes("consumer") || lk.includes("gadget")) return "gadget";
    return "wallet";
  };

  // CIBIL meter color
  const cibilNum = num(form.cibil_score) || 750;
  const cibilColor = cibilNum >= 750 ? "#047857" : cibilNum >= 650 ? "#B45309" : "#B42318";
  const cibilBandText =
    cibilNum >= 750 ? "Excellent" : cibilNum >= 650 ? "Good" : cibilNum >= 550 ? "Average" : "Low";

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Top Bar: Back arrow + Title + 3-part progress bar */}
      <div className="rounded-card border border-cardborder bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (step > 1) {
                  setStep((s) => (s - 1) as 1 | 2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                } else if (onBackToHome) {
                  onBackToHome();
                }
              }}
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center rounded-btn border border-cardborder bg-white text-ink hover:bg-page transition-colors"
            >
              <Icon name="back" size={18} strokeWidth={2} />
            </button>
            <div>
              <h2 className="font-archivo font-extrabold text-xl text-ink leading-none">
                Check my eligibility
              </h2>
              <p className="text-xs text-muted mt-0.5">3 steps, 2 minutes · No PAN or Aadhaar</p>
            </div>
          </div>

          {/* Sample applicant loaders */}
          <div className="hidden sm:flex items-center gap-2">
            {onLoadSample && (
              <button
                type="button"
                onClick={onLoadSample}
                className="text-xs font-700 text-brand hover:underline px-2 py-1 rounded"
              >
                Sample prime
              </button>
            )}
            {onLoadBorderline && (
              <button
                type="button"
                onClick={onLoadBorderline}
                className="text-xs font-700 text-muted hover:text-ink px-2 py-1 rounded"
              >
                Sample borderline
              </button>
            )}
            {onStartOver && (
              <button
                type="button"
                onClick={() => {
                  onStartOver();
                  setStep(1);
                }}
                className="text-xs font-700 text-muted hover:text-ink px-2 py-1 rounded"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* 3-Part Progress Bar */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-cardborder">
          {[
            { num: 1, label: "1 Loan" },
            { num: 2, label: "2 You" },
            { num: 3, label: "3 Credit" },
          ].map((s) => {
            const isDoneOrCurrent = step >= s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => {
                  if (s.num < step) setStep(s.num as 1 | 2 | 3);
                }}
                disabled={s.num > step}
                className="text-left group focus:outline-none"
              >
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    isDoneOrCurrent ? "bg-[#1E4FD8]" : "bg-[#E4E4E7]"
                  }`}
                />
                <span
                  className={`block mt-1.5 text-xs font-archivo font-bold transition-colors ${
                    isDoneOrCurrent ? "text-ink" : "text-muted"
                  }`}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ================= STEP 1: LOAN ================= */}
      {step === 1 && (
        <div className="space-y-6">
          {/* "What is the loan for?" card */}
          <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="font-archivo font-bold text-base text-ink">
                What is the loan for?
              </h3>
              <p className="text-xs text-muted mt-0.5">Select a loan product</p>
            </div>

            {/* 4 Product Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {products.map((p) => {
                const isSelected = form.product === p.id;
                const iconName = getProductIcon(p.id);

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProduct(p.id)}
                    className={`h-[84px] rounded-card p-3 flex flex-col justify-between text-left transition-all ${
                      isSelected
                        ? "border-2 border-[#1E4FD8] bg-[#EEF3FF] text-[#1E4FD8] font-bold shadow-xs"
                        : "border border-cardborder bg-white text-ink hover:border-muted font-600"
                    }`}
                  >
                    <Icon
                      name={iconName}
                      size={20}
                      color={isSelected ? "#1E4FD8" : "#0A0A0A"}
                      strokeWidth={isSelected ? 2.2 : 1.8}
                    />
                    <span className="font-archivo text-sm leading-tight line-clamp-1">
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {fieldErrors.product && (
              <p className="text-xs text-decline font-600">{fieldErrors.product}</p>
            )}

            {/* Variant Chips */}
            {variants.length > 0 && (
              <div className="pt-3 border-t border-cardborder space-y-2">
                <p className="text-xs font-600 text-muted">Select variant:</p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isSelected = form.variant === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          onChange("variant", v.id);
                          applyVariantDefaults(form.product || activeProduct?.id || "personal", v, true);
                        }}
                        className={`text-xs px-3.5 py-1.5 rounded-full font-700 transition-colors ${
                          isSelected
                            ? "bg-ink text-white"
                            : "bg-page border border-cardborder text-muted hover:text-ink"
                        }`}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>

                {fieldErrors.variant && (
                  <p className="text-xs text-decline font-600">{fieldErrors.variant}</p>
                )}

                {activeVariant?.for && (
                  <p className="text-[13px] text-muted leading-relaxed pt-1">
                    {activeVariant.for}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* "How much do you need?" Card */}
          <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="font-archivo font-bold text-base text-ink">
                How much do you need?
              </h3>
              <p className="text-xs text-muted mt-0.5">Select a budget range and adjust the amount</p>
            </div>

            {/* Range chips: 0–1L, 1–3L, 3–5L, 5–10L, 10L+ */}
            <div className="flex flex-wrap gap-2">
              {visibleRanges.map((r) => {
                const isSelected = currentRangeId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleRangeChipSelect(r.id)}
                    className={`text-xs px-3 py-1.5 rounded-full font-bold transition-colors ${
                      isSelected
                        ? "bg-[#1E4FD8] text-white shadow-xs"
                        : "bg-page border border-cardborder text-muted hover:text-ink"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* Amount display in Archivo 34px bold with inWords() */}
            <div className="flex flex-wrap items-baseline gap-3 my-2 pt-1">
              <span className="font-archivo font-extrabold text-[34px] leading-tight text-ink">
                {inr(currentAmountNum || sliderMin)}
              </span>
              <span className="text-sm font-bold text-brand bg-[#EEF3FF] px-2.5 py-0.5 rounded-md">
                {inWords(currentAmountNum || sliderMin)}
              </span>
            </div>

            {/* Slider */}
            <div>
              <input
                id="field-loan_amount"
                name="loan_amount"
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={sliderMax > 2000000 ? 50000 : 10000}
                value={currentAmountNum || sliderMin}
                onChange={(e) => onChange("loan_amount", e.target.value)}
                className="w-full accent-brand cursor-pointer h-2 bg-page rounded-lg"
              />
              <div className="flex justify-between text-xs text-muted font-500 mt-1.5">
                <span>Min: {inr(sliderMin)}</span>
                <span>Max: {inr(sliderMax)}</span>
              </div>
            </div>

            {fieldErrors.loan_amount && (
              <p className="text-xs text-decline font-600">{fieldErrors.loan_amount}</p>
            )}

            {/* Property value (Home loans) */}
            {form.product === "home" && (
              <div className="pt-3 border-t border-cardborder space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <label htmlFor="field-property_value" className="text-xs font-bold text-ink">
                    Estimated Property Value
                  </label>
                  {form.property_value && (
                    <span className="text-xs font-600 text-brand">
                      {inWords(num(form.property_value))}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-muted text-sm font-bold">₹</span>
                  <input
                    id="field-property_value"
                    name="property_value"
                    type="number"
                    value={form.property_value}
                    onChange={(e) => onChange("property_value", e.target.value)}
                    placeholder="e.g. 5000000"
                    className={`w-full h-11 rounded-btn border ${
                      fieldErrors.property_value ? "border-decline ring-1 ring-decline" : "border-cardborder"
                    } bg-white pl-8 pr-3 text-sm text-ink font-600`}
                  />
                </div>
                {fieldErrors.property_value && (
                  <p className="text-xs text-decline font-600">{fieldErrors.property_value}</p>
                )}
              </div>
            )}

            {/* Asset Price (Consumer & Vehicle loans) */}
            {(form.product === "consumer" || form.product === "vehicle") && (
              <div className="pt-3 border-t border-cardborder space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <label htmlFor="field-asset_price" className="text-xs font-bold text-ink">
                    On-road / Asset Purchase Price
                  </label>
                  {form.asset_price && (
                    <span className="text-xs font-600 text-brand">
                      {inWords(num(form.asset_price))}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-muted text-sm font-bold">₹</span>
                  <input
                    id="field-asset_price"
                    name="asset_price"
                    type="number"
                    value={form.asset_price}
                    onChange={(e) => onChange("asset_price", e.target.value)}
                    placeholder="e.g. 800000"
                    className={`w-full h-11 rounded-btn border ${
                      fieldErrors.asset_price ? "border-decline ring-1 ring-decline" : "border-cardborder"
                    } bg-white pl-8 pr-3 text-sm text-ink font-600`}
                  />
                </div>
                {fieldErrors.asset_price && (
                  <p className="text-xs text-decline font-600">{fieldErrors.asset_price}</p>
                )}
              </div>
            )}
          </div>

          {/* "For how long?" Card */}
          <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="font-archivo font-bold text-base text-ink">For how long?</h3>
              <p className="text-xs text-muted mt-0.5">Select loan tenure</p>
            </div>

            {form.product === "home" ? (
              // Years-based chips for home loan
              <div className="flex flex-wrap gap-2">
                {[
                  { yr: 5, mo: 60 },
                  { yr: 10, mo: 120 },
                  { yr: 15, mo: 180 },
                  { yr: 20, mo: 240 },
                  { yr: 25, mo: 300 },
                  { yr: 30, mo: 360 },
                ].map((item) => {
                  const isSelected = num(form.tenure_months) === item.mo;
                  return (
                    <button
                      key={item.mo}
                      type="button"
                      onClick={() => onChange("tenure_months", String(item.mo))}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                        isSelected
                          ? "bg-ink text-white"
                          : "bg-page border border-cardborder text-muted hover:text-ink"
                      }`}
                    >
                      {item.yr} Years ({item.mo} mo)
                    </button>
                  );
                })}
              </div>
            ) : (
              // Month chips for personal / consumer / vehicle
              <div className="flex flex-wrap gap-2">
                {[12, 24, 36, 48, 60].map((months) => {
                  const isSelected = num(form.tenure_months) === months;
                  return (
                    <button
                      key={months}
                      type="button"
                      onClick={() => onChange("tenure_months", String(months))}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                        isSelected
                          ? "bg-ink text-white"
                          : "bg-page border border-cardborder text-muted hover:text-ink"
                      }`}
                    >
                      {months} Months
                    </button>
                  );
                })}
              </div>
            )}

            {fieldErrors.tenure_months && (
              <p className="text-xs text-decline font-600">{fieldErrors.tenure_months}</p>
            )}
          </div>

          {/* Interest Rate Input Card */}
          <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-3">
            <div className="flex justify-between items-baseline">
              <label htmlFor="field-annual_rate" className="font-archivo font-bold text-base text-ink">
                Interest rate (% a year)
              </label>
              <span className="text-xs font-bold text-brand">
                {form.annual_rate ? `${form.annual_rate}% p.a.` : "—"}
              </span>
            </div>

            <div className="relative">
              <input
                id="field-annual_rate"
                name="annual_rate"
                type="number"
                step="0.1"
                min="0"
                max="36"
                value={form.annual_rate}
                onChange={(e) => onChange("annual_rate", e.target.value)}
                placeholder="e.g. 10.5"
                className={`w-full h-11 rounded-btn border ${
                  fieldErrors.annual_rate ? "border-decline ring-1 ring-decline" : "border-cardborder"
                } bg-white px-3 pr-10 text-sm text-ink font-600`}
              />
              <span className="absolute right-3 top-3 text-muted text-xs font-bold">% p.a.</span>
            </div>

            <p className="text-xs text-muted">
              Typical for this loan: {rateRange[0]}% to {rateRange[1]}%
            </p>

            {fieldErrors.annual_rate && (
              <p className="text-xs text-decline font-600">{fieldErrors.annual_rate}</p>
            )}
          </div>
        </div>
      )}

      {/* ================= STEP 2: YOU ================= */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="font-archivo font-bold text-base text-ink">About You</h3>
              <p className="text-xs text-muted mt-0.5">Demographics and monthly income flow</p>
            </div>

            {/* Age & Dependents row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="field-age" className="block text-xs font-bold text-ink mb-1.5">
                  Age (years)
                </label>
                <input
                  id="field-age"
                  name="age"
                  type="number"
                  min="18"
                  max="75"
                  value={form.age}
                  onChange={(e) => onChange("age", e.target.value)}
                  placeholder="e.g. 32"
                  className={`w-full h-11 rounded-btn border ${
                    fieldErrors.age ? "border-decline ring-1 ring-decline" : "border-cardborder"
                  } bg-white px-3 text-sm text-ink font-600`}
                />
                {fieldErrors.age && <p className="text-xs text-decline font-600 mt-1">{fieldErrors.age}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">
                  Number of dependents
                </label>
                <Stepper
                  id="field-no_of_dependents"
                  value={num(form.no_of_dependents)}
                  onChange={(v) => onChange("no_of_dependents", String(v))}
                  min={0}
                  max={10}
                />
                {fieldErrors.no_of_dependents && (
                  <p className="text-xs text-decline font-600 mt-1">{fieldErrors.no_of_dependents}</p>
                )}
              </div>
            </div>

            {/* Employment Type Chips */}
            <div className="pt-2 border-t border-cardborder space-y-2">
              <label className="block text-xs font-bold text-ink">
                Employment Type
              </label>
              <div className="flex flex-wrap gap-2">
                {EMPLOYMENT_TYPES.map((t) => {
                  const isSelected = form.employment_type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => onChange("employment_type", t.value)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        isSelected
                          ? "bg-ink text-white shadow-xs"
                          : "bg-page border border-cardborder text-muted hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.employment_type && (
                <p className="text-xs text-decline font-600 mt-1">{fieldErrors.employment_type}</p>
              )}
            </div>

            {/* Years in current job/profession */}
            <div>
              <label htmlFor="field-years_in_job" className="block text-xs font-bold text-ink mb-1.5">
                Years in current job / business
              </label>
              <input
                id="field-years_in_job"
                name="years_in_job"
                type="number"
                min="0"
                max="50"
                value={form.years_in_job}
                onChange={(e) => onChange("years_in_job", e.target.value)}
                placeholder="e.g. 5"
                className={`w-full h-11 rounded-btn border ${
                  fieldErrors.years_in_job ? "border-decline ring-1 ring-decline" : "border-cardborder"
                } bg-white px-3 text-sm text-ink font-600`}
              />
              {fieldErrors.years_in_job && (
                <p className="text-xs text-decline font-600 mt-1">{fieldErrors.years_in_job}</p>
              )}
            </div>

            {/* Annual Income */}
            <div className="pt-2 border-t border-cardborder space-y-1.5">
              <div className="flex justify-between items-baseline">
                <label htmlFor="field-income_annum" className="text-xs font-bold text-ink">
                  Total Annual Income
                </label>
                {form.income_annum && (
                  <span className="text-xs font-bold text-brand">
                    {inr(num(form.income_annum))} ({inWords(num(form.income_annum))})
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted text-sm font-bold">₹</span>
                <input
                  id="field-income_annum"
                  name="income_annum"
                  type="number"
                  value={form.income_annum}
                  onChange={(e) => onChange("income_annum", e.target.value)}
                  placeholder="e.g. 1200000"
                  className={`w-full h-11 rounded-btn border ${
                    fieldErrors.income_annum ? "border-decline ring-1 ring-decline" : "border-cardborder"
                  } bg-white pl-8 pr-3 text-sm text-ink font-600`}
                />
              </div>
              <p className="text-[11px] text-muted">
                Pre-tax annual income from salary, business, or other declared sources.
              </p>
              {fieldErrors.income_annum && (
                <p className="text-xs text-decline font-600">{fieldErrors.income_annum}</p>
              )}
            </div>

            {/* Existing Monthly EMIs */}
            <div className="pt-2 border-t border-cardborder space-y-1.5">
              <div className="flex justify-between items-baseline">
                <label htmlFor="field-existing_emi_monthly" className="text-xs font-bold text-ink">
                  Existing Monthly EMIs
                </label>
                {form.existing_emi_monthly && (
                  <span className="text-xs font-bold text-brand">
                    {inr(num(form.existing_emi_monthly))}/mo
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted text-sm font-bold">₹</span>
                <input
                  id="field-existing_emi_monthly"
                  name="existing_emi_monthly"
                  type="number"
                  value={form.existing_emi_monthly}
                  onChange={(e) => onChange("existing_emi_monthly", e.target.value)}
                  placeholder="e.g. 8000"
                  className={`w-full h-11 rounded-btn border ${
                    fieldErrors.existing_emi_monthly ? "border-decline ring-1 ring-decline" : "border-cardborder"
                  } bg-white pl-8 pr-3 text-sm text-ink font-600`}
                />
              </div>
              <p className="text-[11px] text-muted">
                Total monthly outflow towards ongoing personal, car, home or card EMIs.
              </p>
              {fieldErrors.existing_emi_monthly && (
                <p className="text-xs text-decline font-600">{fieldErrors.existing_emi_monthly}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: CREDIT ================= */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="rounded-card border border-cardborder bg-white p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="font-archivo font-bold text-base text-ink">Credit & History</h3>
              <p className="text-xs text-muted mt-0.5">Credit bureau score, debt burden and assets</p>
            </div>

            {/* No credit history toggle */}
            <div className="flex items-center justify-between p-3 rounded-card bg-page border border-cardborder">
              <div>
                <p className="text-xs font-bold text-ink">No credit history yet (New to credit)</p>
                <p className="text-[11px] text-muted">Check this if you have never taken a loan or credit card</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.no_credit_history}
                  onChange={(e) => onChange("no_credit_history", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-cardborder peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ink"></div>
              </label>
            </div>

            {/* CIBIL Score Slider + Meter Preview */}
            {!form.no_credit_history && (
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="field-cibil_score" className="text-xs font-bold text-ink">
                    CIBIL Score (300–900)
                  </label>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ color: cibilColor, backgroundColor: `${cibilColor}15` }}
                  >
                    {cibilNum} · {cibilBandText}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-4 rounded-card border border-cardborder bg-white">
                  <div className="shrink-0 flex justify-center">
                    <Meter
                      width={160}
                      value={(cibilNum - 300) / 600}
                      color={cibilColor}
                      big={String(cibilNum)}
                      label={cibilBandText}
                    />
                  </div>
                  <div className="flex-1 w-full space-y-3">
                    <input
                      id="field-cibil_score"
                      name="cibil_score"
                      type="range"
                      min="300"
                      max="900"
                      step="5"
                      value={cibilNum}
                      onChange={(e) => onChange("cibil_score", e.target.value)}
                      className="w-full accent-brand cursor-pointer h-2 bg-page rounded-lg"
                    />
                    <div className="flex justify-between text-[11px] text-muted font-bold">
                      <span>300 (Low)</span>
                      <span>650 (Fair)</span>
                      <span>750+ (Prime)</span>
                      <span>900</span>
                    </div>
                  </div>
                </div>

                {fieldErrors.cibil_score && (
                  <p className="text-xs text-decline font-600">{fieldErrors.cibil_score}</p>
                )}
              </div>
            )}

            {/* Existing loans count & New loans in 12m steppers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-cardborder">
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">
                  Existing active loans
                </label>
                <Stepper
                  id="field-existing_loans_count"
                  value={num(form.existing_loans_count)}
                  onChange={(v) => onChange("existing_loans_count", String(v))}
                  min={0}
                  max={20}
                />
                {fieldErrors.existing_loans_count && (
                  <p className="text-xs text-decline font-600 mt-1">{fieldErrors.existing_loans_count}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">
                  New loans opened in last 12m
                </label>
                <Stepper
                  id="field-new_loans_12m"
                  value={num(form.new_loans_12m)}
                  onChange={(v) => onChange("new_loans_12m", String(v))}
                  min={0}
                  max={10}
                />
                {fieldErrors.new_loans_12m && (
                  <p className="text-xs text-decline font-600 mt-1">{fieldErrors.new_loans_12m}</p>
                )}
              </div>
            </div>

            {/* Total outstanding debt */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <label htmlFor="field-outstanding_debt" className="text-xs font-bold text-ink">
                  Total Outstanding Debt
                </label>
                {form.outstanding_debt && (
                  <span className="text-xs font-bold text-brand">
                    {inr(num(form.outstanding_debt))}
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted text-sm font-bold">₹</span>
                <input
                  id="field-outstanding_debt"
                  name="outstanding_debt"
                  type="number"
                  value={form.outstanding_debt}
                  onChange={(e) => onChange("outstanding_debt", e.target.value)}
                  placeholder="e.g. 120000"
                  className={`w-full h-11 rounded-btn border ${
                    fieldErrors.outstanding_debt ? "border-decline ring-1 ring-decline" : "border-cardborder"
                  } bg-white pl-8 pr-3 text-sm text-ink font-600`}
                />
              </div>
              {fieldErrors.outstanding_debt && (
                <p className="text-xs text-decline font-600">{fieldErrors.outstanding_debt}</p>
              )}
            </div>

            {/* Credit history years & Overdue now */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-cardborder">
              <div>
                <label htmlFor="field-credit_history_years" className="block text-xs font-bold text-ink mb-1.5">
                  Credit history age (years)
                </label>
                <input
                  id="field-credit_history_years"
                  name="credit_history_years"
                  type="number"
                  min="0"
                  max="50"
                  value={form.credit_history_years}
                  onChange={(e) => onChange("credit_history_years", e.target.value)}
                  placeholder="e.g. 8"
                  className={`w-full h-11 rounded-btn border ${
                    fieldErrors.credit_history_years ? "border-decline ring-1 ring-decline" : "border-cardborder"
                  } bg-white px-3 text-sm text-ink font-600`}
                />
                {fieldErrors.credit_history_years && (
                  <p className="text-xs text-decline font-600 mt-1">{fieldErrors.credit_history_years}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">
                  Any overdue payment currently?
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange("overdue_now", false)}
                    className={`flex-1 h-11 rounded-btn font-bold text-xs transition-colors ${
                      !form.overdue_now
                        ? "bg-ink text-white"
                        : "bg-page border border-cardborder text-muted hover:text-ink"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange("overdue_now", true)}
                    className={`flex-1 h-11 rounded-btn font-bold text-xs transition-colors ${
                      form.overdue_now
                        ? "bg-[#B42318] text-white"
                        : "bg-page border border-cardborder text-muted hover:text-ink"
                    }`}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Assets (Optional) Section */}
            <div className="pt-3 border-t border-cardborder">
              <button
                type="button"
                onClick={() => setShowAssets((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-bold text-ink hover:text-brand transition-colors py-2"
              >
                <span>Assets declaration (optional)</span>
                <Icon name={showAssets ? "chevronUp" : "chevronDown"} size={16} />
              </button>

              {showAssets && (
                <div className="space-y-4 pt-3 mt-1">
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <label className="text-xs text-muted">Residential Property Value</label>
                      <span className="text-xs font-bold text-ink">
                        {inr(num(form.residential_assets_value))}
                      </span>
                    </div>
                    <input
                      type="number"
                      value={form.residential_assets_value}
                      onChange={(e) => onChange("residential_assets_value", e.target.value)}
                      placeholder="0"
                      className="w-full h-10 rounded-btn border border-cardborder bg-white px-3 text-xs text-ink font-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <label className="text-xs text-muted">Commercial Assets Value</label>
                      <span className="text-xs font-bold text-ink">
                        {inr(num(form.commercial_assets_value))}
                      </span>
                    </div>
                    <input
                      type="number"
                      value={form.commercial_assets_value}
                      onChange={(e) => onChange("commercial_assets_value", e.target.value)}
                      placeholder="0"
                      className="w-full h-10 rounded-btn border border-cardborder bg-white px-3 text-xs text-ink font-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <label className="text-xs text-muted">Luxury Assets Value (Vehicles, gold)</label>
                      <span className="text-xs font-bold text-ink">
                        {inr(num(form.luxury_assets_value))}
                      </span>
                    </div>
                    <input
                      type="number"
                      value={form.luxury_assets_value}
                      onChange={(e) => onChange("luxury_assets_value", e.target.value)}
                      placeholder="0"
                      className="w-full h-10 rounded-btn border border-cardborder bg-white px-3 text-xs text-ink font-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <label className="text-xs text-muted">Bank Balances & Deposits</label>
                      <span className="text-xs font-bold text-ink">
                        {inr(num(form.bank_asset_value))}
                      </span>
                    </div>
                    <input
                      type="number"
                      value={form.bank_asset_value}
                      onChange={(e) => onChange("bank_asset_value", e.target.value)}
                      placeholder="0"
                      className="w-full h-10 rounded-btn border border-cardborder bg-white px-3 text-xs text-ink font-600"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Borrower consent before eligibility check */}
            <div className="mt-6 pt-5 border-t border-cardborder">
              <label className="flex items-start gap-3 cursor-pointer select-none rounded-card border border-cardborder bg-page/80 p-3.5 sm:p-4 hover:border-brand/40 transition-colors">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConsent(checked);
                    saveConsent(checked);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-cardborder text-brand focus:ring-brand shrink-0 cursor-pointer"
                />
                <span className="text-xs text-muted leading-relaxed">
                  I agree that the numbers I enter are used to pre-screen this loan, and that a summary is sent to a third-party AI provider for the explanation. No name, PAN, Aadhaar or phone is collected.
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ================= LIVE PREVIEW CARD (ALL STEPS) ================= */}
      <div className="rounded-card bg-[#0A0A0A] text-white p-4 shadow-xl border border-[#27272A] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* Small white meter on #3F3F46 track */}
          <div className="shrink-0 flex items-center justify-center">
            <Meter
              width={96}
              value={simResult?.approval_probability ?? (estimatedEmi > 0 ? 0.65 : null)}
              track="#3F3F46"
              color="#FFFFFF"
              showKnob={true}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#A1A1AA]">
                LIVE PREVIEW
              </span>
              {simLoading && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#1E4FD8] animate-ping" />
              )}
            </div>

            <p className="font-archivo font-bold text-sm text-white">
              {simResult ? (
                simResult.decision === "APPROVE" ? (
                  <span className="text-[#34D399]">
                    Likely approved · {Math.round((simResult.approval_probability || 0.65) * 100)}%
                  </span>
                ) : simResult.decision === "REFER" ? (
                  <span className="text-[#FBBF24]">
                    Referred for review · {Math.round((simResult.approval_probability || 0.5) * 100)}%
                  </span>
                ) : (
                  <span className="text-[#F87171]">
                    Decline risk high · {Math.round((simResult.approval_probability || 0.25) * 100)}%
                  </span>
                )
              ) : simIs422 ? (
                <span className="text-[#FBBF24]">
                  Complete the highlighted fields for a preview
                </span>
              ) : estimatedEmi > 0 ? (
                "Eligibility estimating…"
              ) : (
                "Fill loan amount & details for preview"
              )}
            </p>

            <p className="text-xs text-[#A1A1AA]">
              {estimatedEmi > 0
                ? `EMI ${inr(estimatedEmi)} a month · nothing is saved yet`
                : "Nothing is saved yet"}
            </p>
          </div>
        </div>

        {savedDraftToast && (
          <div className="text-xs font-bold text-[#34D399] bg-[#047857]/20 border border-[#047857]/40 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <Icon name="tick" size={14} color="#34D399" />
            <span>Draft saved</span>
          </div>
        )}
      </div>

      {/* ================= STICKY FOOTER NAVIGATION ================= */}
      <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3.5 bg-white/95 backdrop-blur-md border-t border-cardborder shadow-md">
        {errorMessages.length > 0 && (
          <div role="alert" className="max-w-[1100px] mx-auto mb-3 rounded-[10px] border border-[#F3D0CB] bg-[#FBECEA] px-3 py-2 text-xs font-600 text-[#B42318]">
            <span className="font-bold">Please fix: </span>
            {errorMessages.slice(0, 4).join(" · ")}
          </div>
        )}
        <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-3">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="h-11 min-h-[44px] px-5 rounded-btn border border-cardborder bg-white text-xs font-archivo font-bold text-ink hover:bg-page transition-colors"
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() => handleNext(2)}
                className="flex-1 sm:flex-initial h-11 min-h-[44px] px-6 rounded-btn bg-[#1E4FD8] text-xs font-archivo font-bold text-white hover:bg-[#1A44BD] transition-colors shadow-sm inline-flex items-center justify-center gap-2"
              >
                <span>Next: About you</span>
                <Icon name="arrow" size={16} />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="h-11 min-h-[44px] px-5 rounded-btn border border-cardborder bg-white text-xs font-archivo font-bold text-ink hover:bg-page transition-colors inline-flex items-center gap-1.5"
              >
                <Icon name="back" size={14} />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => handleNext(3)}
                className="flex-1 sm:flex-initial h-11 min-h-[44px] px-6 rounded-btn bg-[#1E4FD8] text-xs font-archivo font-bold text-white hover:bg-[#1A44BD] transition-colors shadow-sm inline-flex items-center justify-center gap-2"
              >
                <span>Next: Credit</span>
                <Icon name="arrow" size={16} />
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="h-11 min-h-[44px] px-5 rounded-btn border border-cardborder bg-white text-xs font-archivo font-bold text-ink hover:bg-page transition-colors inline-flex items-center gap-1.5"
              >
                <Icon name="back" size={14} />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={submitting || !consent}
                onClick={handleSubmitClick}
                title={!consent ? "Please agree to the pre-screening consent statement to check eligibility" : undefined}
                className="flex-1 sm:flex-initial h-11 min-h-[44px] px-7 rounded-btn bg-[#1E4FD8] text-xs font-archivo font-bold text-white hover:bg-[#1A44BD] disabled:opacity-40 transition-colors shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span>Evaluating loan…</span>
                ) : (
                  <>
                    <Icon name="check" size={16} color="#fff" strokeWidth={2.4} />
                    <span>Check eligibility</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
