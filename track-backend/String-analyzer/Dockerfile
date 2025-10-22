FROM node:18-alpine
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Run the app
CMD ["node", "src/app.js"]
