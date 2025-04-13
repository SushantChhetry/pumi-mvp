FROM node:18-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build the application
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]