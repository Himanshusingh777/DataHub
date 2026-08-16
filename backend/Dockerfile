# CrossTecch — FastAPI backend image (Phase 1 of the Python migration).
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

# Single worker (uvicorn's default) means one request that does real work
# (BigQuery calls, dashboard generation) blocks every other concurrent
# request on this process. UVICORN_WORKERS forks multiple worker processes
# behind the one listening socket; db.py already opens a fresh SQLite
# connection per request in WAL mode, so concurrent workers are safe.
ENV UVICORN_WORKERS=4
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS}"]
