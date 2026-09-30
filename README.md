# Northstar Account Dashboard

A full-stack account dashboard built with React, Tailwind CSS, Express, MongoDB, bcrypt, and JWT authentication.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A MongoDB database, local or MongoDB Atlas

## Setup

1. Copy `.env.example` to `.env`.
2. Set `MONGO_URI` to your MongoDB connection string.
3. Set `JWT_SECRET` to a long random value.
4. Install all dependencies:

```bash
npm run install:all
```

The existing Atlas-generated `.env` is server-only and is ignored by Git. It currently uses `MONGODB_URI`, which the server also supports for local compatibility, but new configuration should use `MONGO_URI`.

## Run locally

Start the API and Vite frontend together:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and the API runs at `http://localhost:5000`.

Build the frontend:

```bash
npm run build
```

Start only the API:

```bash
npm start
```

## Authentication behavior

Registration stores a bcrypt hash for the password and security answer. Login uses a JWT in an HttpOnly cookie. Forgot Password uses the saved security question and answer only; this project intentionally does not use OTP, email verification, Nodemailer, or any third-party mailing service.

Available API routes include registration, login, logout, current-user lookup, password change, security-question recovery, profile lookup, and profile update. Password hashes and security-answer hashes are never returned to the client.

Before production use, rotate any credentials that have been exposed, replace the development JWT secret, deploy behind HTTPS, and add rate limiting and CSRF protection.
