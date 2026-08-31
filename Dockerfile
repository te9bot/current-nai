# Stage 1: build the Vite frontend (needs Node, which the Python runtime
# image below does not include).
FROM node:22-slim AS webbuild
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build

# Stage 2: the FastAPI app, serving both the API and the built frontend.
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY --from=webbuild /app/dist dist

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
EXPOSE 4000

# Render injects PORT at runtime; default to 4000 for local `docker run`.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-4000}"]
