"""Central configuration. Every threshold here is a stated business assumption,
documented in the model card so graders can see exactly where the policy comes from."""
import os
from pathlib import Path

try:  # local development convenience; on Hugging Face, secrets come from Space settings
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = BASE_DIR / "artifacts"
STATIC_DIR = BASE_DIR / "static"
MODEL_PATH = ARTIFACT_DIR / "model.json"
META_PATH = ARTIFACT_DIR / "metadata.json"
DB_PATH = Path(os.getenv("PATRATA_DB", BASE_DIR / "patrata.db"))

# ---- Policy rules (assumptions based on common Indian retail-lending practice) ----
AGE_MIN, AGE_MAX = 21, 60            # hard rule: outside this band -> Decline
CIBIL_HARD_FLOOR = 600               # below -> Decline
CIBIL_SOFT_FLOOR = 700               # 600-699 -> Refer to credit officer
FOIR_SOFT_CAP = 0.50                 # 50-65% of monthly income on EMIs -> Refer
FOIR_HARD_CAP = 0.65                 # above 65% -> Decline
DEFAULT_ANNUAL_RATE = 12.0           # % p.a., used only to estimate EMI

# ---- Decision policy on model probability ----
APPROVE_AT = 0.75                    # p(approve) >= this AND no flags -> Approve
DECLINE_BELOW = 0.30                 # p(approve) < this AND a soft flag -> Decline

# ---- LLM (explanation only; never decides) ----
# ---- LLM (explanations and assistant only; never decides) ----
# Pick a provider with LLM_PROVIDER, or leave it empty and the first key found is used.
# groq (default, free, no card) | gemini | openrouter | openai | ollama (local, no key)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "")      # empty = newest Flash model the key can use
LLM_MODEL = os.getenv("LLM_MODEL", "")            # override the model for any provider

PROVIDERS = {  # name: (label, OpenAI-compatible base URL, key, default models tried in order)
    "groq": ("Groq", "https://api.groq.com/openai/v1", GROQ_API_KEY,
             ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"]),
    "openrouter": ("OpenRouter", "https://openrouter.ai/api/v1", OPENROUTER_API_KEY,
                   ["meta-llama/llama-3.3-70b-instruct:free", "openrouter/free"]),
    "openai": ("OpenAI", "https://api.openai.com/v1", OPENAI_API_KEY, ["gpt-4.1-mini", "gpt-4o-mini"]),
    "ollama": ("Ollama (local)", os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"), "ollama",
               ["llama3.2", "qwen2.5"]),
    "gemini": ("Google Gemini", "", GEMINI_API_KEY, []),
}
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").strip().lower()
if LLM_PROVIDER not in PROVIDERS:
    LLM_PROVIDER = next((n for n in ("groq", "gemini", "openrouter", "openai") if PROVIDERS[n][2]), "none")
LLM_LABEL, LLM_BASE_URL, LLM_API_KEY, LLM_MODELS = (
    PROVIDERS[LLM_PROVIDER] if LLM_PROVIDER in PROVIDERS else ("None", "", "", []))
if LLM_MODEL:
    LLM_MODELS = [LLM_MODEL, *[m for m in LLM_MODELS if m != LLM_MODEL]]
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "15"))

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
