FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ENV DATA_DIR=/data
ENV PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
