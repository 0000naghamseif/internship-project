FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm config set fetch-timeout 900000 && npm config set fetch-retries 10 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 120000 && npm config set maxsockets 3 && npm ci --prefer-offline --no-audit --no-fund


COPY . .

EXPOSE 3000

CMD ["npm", "start"]