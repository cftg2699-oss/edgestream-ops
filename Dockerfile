FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p recordings metrics

EXPOSE 8080

CMD ["node", "src/server/server.js"]
