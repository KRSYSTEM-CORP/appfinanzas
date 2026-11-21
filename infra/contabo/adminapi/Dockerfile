FROM node:22-alpine
WORKDIR /app
RUN npm init -y >/dev/null && npm i pg@8 --omit=dev --no-audit --no-fund >/dev/null
COPY server.mjs .
USER node
CMD ["node","server.mjs"]
