# RFQ Auction System

A modern web application for managing Request for Quote (RFQ) auctions using a British auction model. Buyers can solicit quotes from multiple sellers and conduct real-time auctions to find the best pricing.

## Tech Stack

- **Frontend:** React, Vite, Axios
- **Backend:** Node.js, Express
- **Architecture:** Modular, RESTful API

## Project Structure

```
RFQ_System/
├── client/                 # React frontend
│   └── src/
│       ├── pages/         # Page components
│       ├── components/    # Reusable components
│       ├── services/      # API service layer
│       └── App.jsx        # Main app component
├── index.js               # Express server entry point
├── routes/                # API route definitions
├── controllers/           # Request handlers
├── services/              # Business logic
├── models/                # Data models
├── config/                # Configuration
└── package.json
```

## Quick Start

### Backend Setup

```bash
# Install dependencies
npm install

# Run development server (with auto-reload)
npm run dev

# Or run production server
npm start
```

The backend runs on `http://localhost:3000` by default.

**API Health Check:**

```
GET /api/health
Response: { "message": "Server running" }
```

### Frontend Setup

```bash
cd client

# Install dependencies
npm install

# Run development server
npm run dev
```

The frontend runs on `http://localhost:5173` by default and connects to the backend on `http://localhost:5000`.

## Environment Variables

Create a `.env` file in the root directory:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rfq_system
DB_USER=user
DB_PASSWORD=password
```

## Development

Both frontend and backend support hot-reload during development. Start each in separate terminal sessions for the best experience.

# RFQ_System