# Bridal Booking App

A full-stack marketplace app that works as a middle platform between **Makeup Artists** and **Customers** (similar to marketplace flow in large booking/e-commerce platforms).

## Roles

- **Customer**
  - Register/login
  - Browse multiple artists
  - Filter by city, specialty, fees, and rating
  - Create booking requests
  - Track booking status and cancel when allowed

- **Makeup Artist**
  - Register/login
  - Build and manage their public profile page
  - Add services and pricing
  - Add availability slots and schedule
  - View incoming bookings and update booking status

- **Admin**
  - Verify artist profiles
  - Access moderation reports

## MVP Features Implemented

- Role-based authentication (artist/customer/admin)
- Artist profile builder (bio, city, specialties, fee, portfolio)
- Artist service & pricing management
- Artist availability management
- Customer artist discovery and filtering
- Booking lifecycle (`pending -> confirmed/rejected -> completed/cancelled`)
- Double-booking prevention via time overlap checks
- Ratings/reviews (post-completion only)
- In-app notifications
- Admin verification + reporting endpoints

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express
- **Storage:** LowDB JSON persistence (`backend/db.json`)
- **Auth:** JWT

## Project Structure

- `/frontend` – React web app UI
- `/backend` – Express API server
- `/package.json` – root scripts for monorepo workflow

## Local Setup

```bash
# from repository root
npm install

# frontend and backend dependencies are already tracked,
# but if needed:
npm --prefix frontend install
npm --prefix backend install
```

## Run in Development

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Build / Lint / Test

```bash
npm run lint
npm run build
npm test
```

## Default Admin Credentials

- **Email:** `admin@bridalapp.local`
- **Password:** `admin123`

> Change credentials and JWT secret for production usage.

## API Highlights

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/artists`
- `PUT /api/artists/me/profile`
- `POST /api/artists/me/services`
- `POST /api/artists/me/availability`
- `POST /api/bookings`
- `PATCH /api/bookings/:bookingId/status`
- `POST /api/reviews`
- `PATCH /api/admin/artists/:artistUserId/verify`
