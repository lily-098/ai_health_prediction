# Stage 1: Build the React Application
FROM node:20-alpine AS build

# Set the working directory
WORKDIR /app

# Copy dependency definition files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Build the production bundle
RUN npm run build

# Stage 2: Serve the Static Files via Nginx
FROM nginx:alpine

# Copy the build outputs from the previous stage to Nginx's serve directory
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Run Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
