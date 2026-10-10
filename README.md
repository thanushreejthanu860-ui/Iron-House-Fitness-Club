# Iron House Fitness Club

A gym membership management website built with HTML, CSS, and JavaScript, with an Express server and an Oracle Database backend.

## Features

- Browse membership plans and plan details.
- Register members with contact details and a selected plan.
- Record payments and view payment history.
- View dashboard summaries.
- Member phone numbers must contain exactly 10 digits.

## Requirements

- Node.js and npm
- An Oracle Database with tables compatible with the queries in `server.js`

## Setup

1. Install the Node.js dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with your Oracle connection settings:

   ```env
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   DB_CONNECT_STRING=localhost:1521/your_service_name
   PORT=3000
   ```

3. Start the app:

   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000).

Keep `.env` private. It is excluded from Git.

## Pages

- `/` — Home
- `/members.html` — Member registration
- `/plans.html` — Membership plans
- `/payment.html` — Record a payment
- `/history.html` — Payment history

## API routes

- `GET /api/test` — Check database connectivity
- `GET /api/plans` and `POST /api/plans` — List or create plans
- `GET /api/members` and `POST /api/members` — List or register members
- `POST /api/payments` — Record a payment
- `GET /api/dashboard` — Load dashboard data
- `GET /api/payment-details` — Load payment history details

## Database note

The server uses the Oracle Node.js driver (`oracledb`) and expects Oracle connection settings in `.env`. The included `sql/gym_database.sql` is written for MySQL, so it is not directly executable against the Oracle backend. Set up the matching Oracle tables before using database-backed features.
