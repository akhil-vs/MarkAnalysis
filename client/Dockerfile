FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
ARG VITE_ENABLE_DEMO_LOGIN=false
ENV VITE_ENABLE_DEMO_LOGIN=$VITE_ENABLE_DEMO_LOGIN
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
