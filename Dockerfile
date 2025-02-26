FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.json /app/
COPY src/ .


RUN npm install

RUN npm run build

CMD ["node", "dist/index.js"]
