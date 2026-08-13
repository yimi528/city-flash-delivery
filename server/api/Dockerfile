FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run prisma:generate && npm run build

FROM build AS migration
CMD ["npm", "run", "prisma:deploy"]

FROM node:22-alpine AS runtime
WORKDIR /app
# CloudBase demo defaults: keep the pure experience version self-contained.
# Production deployments must override these values through service settings.
ENV NODE_ENV=development \
    APP_RELEASE_STAGE=testing \
    WECHAT_LOGIN_MOCK_ENABLED=true \
    WECHAT_PAY_MOCK_ENABLED=true \
    WECHAT_PAY_MODE=mock \
    OPERATOR_BOOTSTRAP_ENABLED=true \
    ENABLE_SWAGGER=true
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node prisma ./prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
