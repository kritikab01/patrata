import os
import sys
import tempfile
from pathlib import Path

os.environ["PATRATA_DB"] = str(Path(tempfile.mkdtemp()) / "test.db")
for _k in ("GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "LLM_PROVIDER"):
    os.environ[_k] = ""   # tests never call a real AI API
os.environ["SEED_DEMO"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
