# Dynamic Profile Endpoint API

## Overview
This API demonstrates the ability to:
- Consume third-party APIs (Cat Facts API).
- Format JSON responses dynamically.
- Handle errors and timeouts gracefully.
- Deploy on a cloud platform (Railway).

## Features
- GET `/me` endpoint returns user profile data and a random cat fact.
- Dynamic UTC timestamp in ISO 8601 format.
- Integration with `https://catfact.ninja/fact` for cat facts.
- Error handling for API failures with fallback messages.

## Setup Instructions

### Prerequisites
- Node.js (version 22.20.0 or later recommended).
- npm (Node Package Manager).
- Git (for cloning the repository).

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/baebekay/HNG13-Internship.git
   cd track-backend/namenstall dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following (optional, defaults to 3000 if not set):
   ```
   PORT=3000
   ```
4. Run the application locally:
   ```bash
   npm run dev
   ```
5. Access the endpoint at `http://localhost:3000/me`.

### Testing
- Use a tool like Postman or `curl` to test the endpoint:
  ```bash
  curl http://localhost:3000/me
  ```
- Expected response:
  ```json
  {
    "status": "success",
    "user": {
      "email": "email",
      "name": "Full Name",
      "stack": "Node.js/Express"
    },
    "timestamp": "2025-10-17T20:19:00.000Z",
    "fact": "Cats can jump up to five times their own height."
  }
  ```

## Dependencies
- `express`: Web framework for Node.js.
- `axios`: HTTP client for fetching cat facts.
- `cors`: Middleware for Cross-Origin Resource Sharing.
- `dotenv`: Environment variable management.
- `nodemon` (dev): Development server with auto-restart.

Install them via:
```bash
npm install express axios cors dotenv
npm install --save-dev nodemon
```

## Deployment
- **Platform**: Deployed on Railway.
- **Deployed URL**: [https://hng13-internship-production.up.railway.app](https://hng13-internship-production.up.railway.app/me)
## Environment Variables
- `PORT`: Port for the server (default: 3000)
