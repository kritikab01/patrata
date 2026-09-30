# Hugging Face Spaces (Docker). Serves the website and the API from one container on port 7860.
FROM python:3.12-slim

# XGBoost needs the OpenMP runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Spaces run containers as user 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PATRATA_DB=/tmp/patrata.db

WORKDIR /home/user/app
COPY --chown=user backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user backend/app ./app
COPY --chown=user backend/artifacts ./artifacts
COPY --chown=user backend/static ./static

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
