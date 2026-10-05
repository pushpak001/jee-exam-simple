FROM node:20-alpine
 
ENV NODE_ENV=production
WORKDIR /app
 
# install dependencies first (cached unless package.json changes)
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
 
# app files (questions.json is baked into the image)
COPY server.js db.js add-user.js index.html questions.json ./
 
# folder for sessions.json (timers / tab-switch counts); mounted as a volume
RUN mkdir -p /data && chown node:node /data
ENV SESSIONS_FILE=/data/sessions.json
 
USER node
EXPOSE 5000
 
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health || exit 1
 
CMD ["node", "server.js"]
 