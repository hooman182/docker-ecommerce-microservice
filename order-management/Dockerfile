# Use the official Maven runtime with JDK 17 as a base image
FROM maven:3.6.3-openjdk-17-slim

# Set the working directory inside the container
WORKDIR /app/

# Copy the project files
COPY settings.xml /root/.m2/settings.xml
COPY pom.xml .

# Download dependencies first (cached layer; fast mirror via settings.xml)
RUN mvn -B -q -DskipTests dependency:go-offline || true

COPY src ./src

RUN mvn -B -q -DskipTests package && mv target/*.jar app.jar && echo built > .buildok

# Expose the port that the application listens on
EXPOSE 9090

# Run the packaged jar directly (no Maven at runtime)
CMD ["java", "-jar", "app.jar"]
