# Country Currency & Exchange API

A **RESTful API** that:
- Fetches country data
- Integrates real-time exchange rates
- Computes estimated GDP
- Caches in **PostgreSQL (Railway)**
- Generates **summary image**

---

## Tech Stack

- **Node.js** + **Express**
- **PostgreSQL** (via Railway)
- **Axios** – HTTP client
- **Jimp** – Image generation
- **pg** – PostgreSQL driver

---

## Setup (Local or Railway)

### 1. Clone & Install

git clone https://github.com/baebeekay/track-backend/country-exchange-api.git
cd country-exchange-api
npm install

### Running Locally
- Start the server with `node app.js`.
- The API will be available at `http://localhost:3000`.
- First, call `POST /countries/refresh` to populate the database.
- Test other endpoints using tools like Postman or curl.

### API Documentation
- **POST /countries/refresh**: Refreshes country data from external APIs, updates/inserts into DB, and generates summary image.
- **GET /countries**: Lists all countries. Supports query params: `?region=Africa`, `?currency=NGN`, `?sort=gdp_desc`.
- **GET /countries/:name**: Gets a country by name.
- **DELETE /countries/:name**: Deletes a country by name.
- **GET /status**: Returns total countries and last refresh timestamp.
- **GET /countries/image**: Serves the summary image (PNG).

