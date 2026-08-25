FROM node:20

RUN apt-get update && apt-get install -y poppler-utils libreoffice --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p uploads processed

COPY package*.json ./

RUN npm config set fetch-timeout 900000 && npm config set fetch-retries 10 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 120000 && npm config set maxsockets 1

RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci --prefer-offline --no-audit --no-fund

RUN sed -i "s/process.exit(1);/\/\/ process.exit(1); \/\/ patched: allow linux/" /app/node_modules/pdf-poppler/index.js

RUN sed -i "s|else {|else if (platform === 'linux') { popplerPath = '/usr/bin'; } else {|" /app/node_modules/pdf-poppler/index.js

COPY . .

EXPOSE 3001

CMD ["npm", "start"]