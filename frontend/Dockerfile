FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Expose port for Vite dev server
EXPOSE 5173

# Run dev server and expose to network
CMD ["npm", "run", "dev", "--", "--host"]
