# Use the official Node.js image as the base image
FROM node:20-alpine3.16

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package.json ./
COPY package-lock.json ./

RUN npm cache clean --force

# Install dependencies using package-lock.json
RUN npm install

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "run", "dev"]
