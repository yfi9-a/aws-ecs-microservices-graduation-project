<img width="1712" height="1444" alt="image" src="https://github.com/user-attachments/assets/9a24010a-d455-4341-b916-225b51c1187b" /># AWS ECS Fargate Microservices with Service Discovery

## 🚀 Project Overview
This repository contains a containerized microservices application designed for high availability, scalability, and secure session management on AWS. The system splits a monolithic structure into three independent backend services and a dedicated static frontend, leveraging modern Cloud Native architectures.

---

## 🏗️ Architecture Design
<img width="1206" height="1083" alt="image" src="https://github.com/user-attachments/assets/f72f4494-7468-4bba-9164-e2c128b4578f" />

The infrastructure is designed to run within a secure multi-AZ Amazon VPC network environment.

* **Frontend Container:** Served via Nginx to handle user interactions (Login, Registration, Order Creation, and Notification polling).
* **Core Microservices:**
  * **Auth Service (Port 3001):** Manages user registration and JWT authentication securely backed by **Amazon ElastiCache (Redis)**.
  * **Orders Service (Port 3003):** Handles order processing, syncs state with Redis, and dispatches events.
  * **Notifications Service (Port 3002):** Receives internal order events to trigger real-time alert logs.
* **Service Discovery (AWS Cloud Map):** Enables secure, internal service-to-service communication via private DNS namespace routes without exposing internal ports to the public internet.
* **Traffic Routing:** An **Application Load Balancer (ALB)** exposes external traffic using path-based routing rules (`/api/auth/*`, `/api/orders/*`, `/api/notifications/*`).

---

## 🛠️ Tech Stack & Key AWS Services
* **Compute:** Amazon ECS Fargate (Serverless Container Management)
* **Registry:** Amazon ECR (Private Registry with Scan on Push)
* **Caching & Database:** Amazon ElastiCache (Redis Cluster)
* **Service Discovery:** AWS Cloud Map (DNS-Based Service Discovery)
* **Routing:** AWS Application Load Balancer (ALB)
* **Backend:** Node.js, Express.js
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (served via Nginx)

---

## 💻 Local Infrastructure Deployment (Docker Compose)
To spin up the entire architecture locally for evaluation:

1. Clone the repository.
2. Build and run the containers using Docker Desktop:
```bash
docker compose up --build
