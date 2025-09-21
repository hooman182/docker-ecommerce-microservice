# Ecommerce Microservices Architecture

This project demonstrates a complete microservices-based ecommerce platform built using Docker technology. It showcases containerization, service orchestration, and inter-service communication in a distributed system.

## Architecture Overview

The application follows a microservices architecture pattern, where each business domain is implemented as an independent service. This approach provides scalability, maintainability, and technology diversity across services.

### Services

- **ecommerce-ui**: React-based frontend application serving the user interface
- **product-catalog**: Node.js service managing product information and catalog
- **product-inventory**: Python Flask service handling inventory management
- **order-management**: Java Spring Boot service processing orders
- **profile-management**: Node.js service managing user profiles and authentication
- **contact-support-team**: Python Flask service for customer support interactions
- **shipping-and-handling**: Go service managing shipping and logistics

### Communication

Services communicate via HTTP REST APIs. The frontend (ecommerce-ui) acts as the entry point and orchestrates calls to backend services. Backend services can also communicate with each other as needed (e.g., order-management calls product-inventory and product-catalog).

## Prerequisites

- Docker installed on your system
- Docker Compose (for easy setup)
- At least 4GB of available RAM
- Ports 3001-3003, 4000, 8000, 8080, 9090 available

## Getting Started

### Option 1: Easy Way (Recommended) - Using Docker Compose

1. Navigate to the root directory of the project
2. Run the following command:

```bash
docker-compose up
```

This will:
- Build and start all services
- Set up a Docker network for inter-service communication
- Configure environment variables automatically
- Expose services on their respective ports

The application will be available at:
- Frontend UI: http://localhost:4000

### Option 2: Normal Way - Manual Docker Commands

If you prefer to start services individually, follow these steps:

1. **Create a Docker network** for service communication:
```bash
docker network create ecommerce-network
```

2. **Build and run each service** in the following order:

#### Product Catalog
```bash
cd product-catalog
docker build -t product-catalog .
docker run -d --network ecommerce-network -p 3001:3001 --name product-catalog product-catalog
```

#### Product Inventory
```bash
cd ../product-inventory
docker build -t product-inventory .
docker run -d --network ecommerce-network -p 3002:3002 --name product-inventory product-inventory
```

#### Shipping and Handling
```bash
cd ../shipping-and-handling
docker build -t shipping-and-handling .
docker run -d --network ecommerce-network -p 8080:8080 --name shipping-and-handling shipping-and-handling
```

#### Profile Management
```bash
cd ../profile-management
docker build -t profile-management .
docker run -d --network ecommerce-network -p 3003:3003 --name profile-management profile-management
```

#### Contact Support Team
```bash
cd ../contact-support-team
docker build -t contact-support-team .
docker run -d --network ecommerce-network -p 8000:8000 --name contact-support-team contact-support-team
```

#### Order Management
```bash
cd ../order-management
docker build -t order-management .
docker run -d --network ecommerce-network \
  -e PRODUCT_INVENTORY_API_HOST=http://product-inventory \
  -e PRODUCT_CATALOG_API_HOST=http://product-catalog \
  -e SHIPPING_HANDLING_API_HOST=http://shipping-and-handling \
  -p 9090:9090 --name order-management order-management
```

#### Ecommerce UI
```bash
cd ../ecommerce-ui
docker build -t ecommerce-ui .
docker run -d --network ecommerce-network \
  -e REACT_APP_PROFILE_API_HOST=http://profile-management \
  -e REACT_APP_PRODUCT_API_HOST=http://product-catalog \
  -e REACT_APP_INVENTORY_API_HOST=http://product-inventory \
  -e REACT_APP_ORDER_API_HOST=http://order-management \
  -e REACT_APP_SHIPPING_API_HOST=http://shipping-and-handling \
  -e REACT_APP_CONTACT_API_HOST=http://contact-support-team \
  -p 4000:4000 --name ecommerce-ui ecommerce-ui
```

3. **Verify services are running**:
```bash
docker ps
```

4. **Access the application** at http://localhost:4000

### Environment Variables

The following environment variables are required for proper inter-service communication:

**For ecommerce-ui:**
- `REACT_APP_PROFILE_API_HOST`
- `REACT_APP_PRODUCT_API_HOST`
- `REACT_APP_INVENTORY_API_HOST`
- `REACT_APP_ORDER_API_HOST`
- `REACT_APP_SHIPPING_API_HOST`
- `REACT_APP_CONTACT_API_HOST`

**For order-management:**
- `PRODUCT_INVENTORY_API_HOST`
- `PRODUCT_CATALOG_API_HOST`
- `SHIPPING_HANDLING_API_HOST`

## Stopping Services

### Using Docker Compose
```bash
docker-compose down
```

### Manual Stop
```bash
docker stop $(docker ps -q)
docker rm $(docker ps -aq)
docker network rm ecommerce-network
```

## Development Notes

- Each service is containerized with its own Dockerfile
- Services use different technology stacks to demonstrate polyglot microservices
- The Docker network enables seamless communication between containers
- Environment variables configure service endpoints dynamically
- This setup demonstrates Docker's container orchestration capabilities

## Troubleshooting

- Ensure all required ports are available
- Check Docker network connectivity if services can't communicate
- Verify environment variables are set correctly
- Use `docker logs <container-name>` to debug individual services

## Enhanced Version with Database

For a more advanced implementation with persistent data storage, check out the **V2 Enhanced Version** of this project that includes database integration:

🔗 **[Docker Ecommerce Microservices with Database](https://github.com/rian-tester/docker-ecommerce-microservice-db)**

### V2 Features:
- **Database Integration**: PostgreSQL, MongoDB, and Redis for data persistence
- **Data Consistency**: ACID transactions and data integrity
- **Enhanced APIs**: Full CRUD operations with persistent storage
- **Production Ready**: Database clustering and backup strategies
- **Performance Optimization**: Caching layers and connection pooling
