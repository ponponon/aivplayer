FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json server.mjs ./

USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
