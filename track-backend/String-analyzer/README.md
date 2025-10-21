# String Analyzer Service

A RESTful API for analyzing strings.

## Setup
1. Clone the repo
2. Install: `npm install`
3. Set `DATABASE_URL` in `.env`
4. Run: `npm start`

## Dependencies
- express
- sequelize
- pg, pg-hstore
- jest

## Endpoints
- POST /strings: Analyze a string
- GET /strings/:stringValue: Retrieve a string
- GET /strings: Filter strings
- GET /strings/filter-by-natural-language: Natural language filtering
- DELETE /strings/:stringValue: Delete a string

## Testing
Run: `npm test`

## Deployment
Deployed on Railway with PostgreSQL.
