"""Request/response contracts. Validation here is the first line of defence (E-Q2):
bad input is rejected with a plain message before it ever reaches the model."""
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

Decision = Literal["APPROVE", "REFER", "DECLINE"]


class ApplicationIn(BaseModel):
    request_id: str = Field(..., min_length=8, max_length=64,
                            description="Client-generated id; resubmitting the same id returns the same result")
    age: int = Field(..., ge=18, le=75, description="Applicant age in years")
    no_of_dependents: int = Field(0, ge=0, le=10)
    income_annum: float = Field(..., gt=0, le=1_000_000_000, description="Annual income in ₹")
    loan_amount: float = Field(..., gt=0, le=1_000_000_000, description="Requested amount in ₹")
    loan_term: float = Field(..., ge=0.25, le=30, description="Term in years (0.5 = 6 months)")
    cibil_score: Optional[int] = Field(None, ge=300, le=900)
    no_credit_history: bool = Field(False, description="First-time borrower with no CIBIL score")
    product: Optional[str] = Field(None, description="personal, home, consumer or vehicle")
    variant: Optional[str] = Field(None, description="A variant id from the product book")
    property_value: Optional[float] = Field(None, gt=0, le=10_000_000_000, description="Home loans: property value in ₹")
    existing_loans_count: int = Field(0, ge=0, le=50, description="Active loans and credit cards on the credit report")
    outstanding_debt: float = Field(0, ge=0, le=1_000_000_000, description="Total outstanding on those loans, ₹")
    overdue_now: bool = Field(False, description="Is any loan or card payment overdue right now?")
    credit_history_years: Optional[float] = Field(None, ge=0, le=60, description="Years since the first loan or card")
    new_loans_12m: int = Field(0, ge=0, le=30, description="Loans or cards opened in the last 12 months")
    asset_price: Optional[float] = Field(None, gt=0, le=1_000_000_000, description="Vehicle or product price in ₹")
    residential_assets_value: float = Field(0, ge=0)
    commercial_assets_value: float = Field(0, ge=0)
    luxury_assets_value: float = Field(0, ge=0)
    bank_asset_value: float = Field(0, ge=0)
    existing_emi_monthly: float = Field(0, ge=0, description="Current EMIs per month in ₹")
    annual_rate: float = Field(12.0, ge=0, le=36, description="Interest rate % p.a. (0 for no-cost EMI)")
    employment_type: Literal["salaried", "self_employed", "government", "pensioner", "not_employed"] = "salaried"
    years_in_job: float = Field(3.0, ge=0, le=50, description="Years in current job or business")

    @model_validator(mode="after")
    def cross_checks(self):
        if self.variant:
            from .products import get
            found = get(self.variant)
            if not found:
                raise ValueError("Unknown loan variant. Choose one from the product catalogue.")
            prod, v = found
            if self.product and self.product != prod["id"]:
                raise ValueError(f"{v['name']} belongs to {prod['name']}, not the product chosen.")
            self.product = prod["id"]
            if v["criteria"].get("ltv") == "rbi_home" and not self.property_value:
                raise ValueError("Enter the property value. Home loans are capped at a share of it (RBI).")
            if v["criteria"].get("ltv") == "asset" and not self.asset_price:
                raise ValueError("Enter the price of the vehicle or product.")
        if self.no_credit_history:
            if self.existing_loans_count or self.outstanding_debt or self.overdue_now or self.new_loans_12m or (self.credit_history_years or 0) > 0:
                raise ValueError("A first-time borrower can't have existing loans or credit history. Untick 'No credit history yet' or set those to 0.")
            self.cibil_score = None
        elif self.cibil_score is None:
            raise ValueError("Enter the CIBIL score, or choose 'No credit history yet'.")
        if self.credit_history_years is not None and self.credit_history_years > max(0, self.age - 16):
            raise ValueError("Years of credit history can't be more than the applicant's age minus 16.")
        if self.existing_emi_monthly >= self.income_annum / 12:
            raise ValueError("Existing EMIs are equal to or higher than monthly income. Check both figures.")
        if self.years_in_job > max(0, self.age - 15):
            raise ValueError("Years in the current job can't be more than the applicant's age minus 15.")
        if self.age + self.loan_term > 75:
            raise ValueError("Age plus loan term goes past 75. Shorten the term or check the age.")
        return self


class RuleCheck(BaseModel):
    id: str
    label: str
    status: Literal["pass", "refer", "fail"]
    value: str
    threshold: str
    detail: str


class Driver(BaseModel):
    feature: str
    label: str
    value: str
    impact: float
    direction: Literal["towards_approval", "towards_decline"]


class Counterfactual(BaseModel):
    possible: bool
    loan_amount: Optional[float] = None
    loan_term: Optional[float] = None
    summary: str


class DecisionOut(BaseModel):
    id: str
    decision: Decision
    approval_probability: Optional[float]
    reasons: list[str]
    rule_checks: list[RuleCheck]
    drivers: list[Driver]
    counterfactual: Counterfactual
    flags: list[str]
    warnings: list[str]
    emi_estimate: float
    foir: float
    model_version: str
    created_at: str
    application: dict = {}
    sample: bool = False
    repayment_risk: dict = {}
    product_name: Optional[str] = None
    variant_name: Optional[str] = None
    approval_model_note: Optional[str] = None
    other_variants: list[dict] = []
    emi_detail: Optional[dict] = None
    review: Optional[dict] = None
    status: str = ""


class Explanation(BaseModel):
    summary: str
    reasons: list[str]
    next_steps: str
    language: Literal["en", "hi"]
    source: Literal["llm", "template"]
    fallback_reason: Optional[str] = None


class AskIn(BaseModel):
    question: str = Field(..., min_length=2, max_length=500)
    language: Literal["en", "hi"] = "en"


class AskOut(BaseModel):
    answer: str
    in_scope: bool
    source: Literal["llm", "template", "guard"]


class SimulateIn(ApplicationIn):
    """Same checks as a real application, but nothing is saved (what-if simulator)."""
    request_id: str = "simulate-only"


class BatchIn(BaseModel):
    rows: list[dict] = Field(..., min_length=1, max_length=500)


class ReviewIn(BaseModel):
    final_decision: Literal["APPROVE", "DECLINE"]
    note: str = Field(..., min_length=10, max_length=600, description="Reason for the final decision")
    reviewer: str = Field("Credit manager", min_length=2, max_length=60)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=2000)


class AssistantIn(BaseModel):
    question: str = Field(..., min_length=2, max_length=500)
    language: Literal["en", "hi"] = "en"
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
