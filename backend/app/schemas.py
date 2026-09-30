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
    loan_term: int = Field(..., ge=1, le=30, description="Term in years")
    cibil_score: int = Field(..., ge=300, le=900)
    residential_assets_value: float = Field(0, ge=0)
    commercial_assets_value: float = Field(0, ge=0)
    luxury_assets_value: float = Field(0, ge=0)
    bank_asset_value: float = Field(0, ge=0)
    existing_emi_monthly: float = Field(0, ge=0, description="Current EMIs per month in ₹")
    annual_rate: float = Field(12.0, ge=1, le=36, description="Assumed interest rate % p.a.")

    @model_validator(mode="after")
    def cross_checks(self):
        if self.existing_emi_monthly >= self.income_annum / 12:
            raise ValueError("Existing EMIs are equal to or higher than monthly income. Check both figures.")
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
    loan_term: Optional[int] = None
    summary: str


class DecisionOut(BaseModel):
    id: str
    decision: Decision
    approval_probability: float
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
