# WhatsApp API Gateway — Enterprise Express Backend

A lightweight, high-performance modular monolith Express backend powered by PostgreSQL, Prisma, Socket.IO, and Baileys WhatsApp Web API. Designed for easy deployment on free cloud platforms like Render, Railway, or Fly.io.

## Architecture

```text
Route -> Controller -> Service -> Repository -> Prisma ORM -> PostgreSQL
```

- **Database**: PostgreSQL (persisting Auth State, Messages, Sessions, API Keys, Webhooks, Media files bytea, ERP models)
- **Realtime**: Socket.IO & Server-Sent Events (SSE)
- **Validation**: Zod schema validation
- **Logging**: Winston logger
- **API Documentation**: Swagger UI at `/api/v1/docs`

## Setup & Running

### 1. Prerequisites
- Node.js >= 20
- PostgreSQL database

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

### 3. Database Migration & Seeding
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. Running the Server
```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

### 5. Render Deployment
1. Create a new **PostgreSQL Instance** on Render.
2. Create a new **Web Service** on Render, connect your Git repository, set root directory to `server`.
3. Set build command: `npm install && npx prisma generate && npm run build`
4. Set start command: `npm start`
5. Add environment variable `DATABASE_URL` pointing to your Render PostgreSQL connection string.
