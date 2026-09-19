FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data /app/storage/inbox /app/storage/originals
ENV NODE_ENV=production PORT=3600 DATA_DIR=/app/data INBOX_DIR=/app/storage/inbox ORIGINALS_DIR=/app/storage/originals
EXPOSE 3600
CMD ["npm","start"]
