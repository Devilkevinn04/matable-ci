FROM node:22-alpine

WORKDIR /app
COPY services/api-gateway/src ./src
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/server.mjs"]
