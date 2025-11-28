FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 5001

ENV HOST=0.0.0.0
ENV PORT=5001

CMD ["npm", "run", "start"]
