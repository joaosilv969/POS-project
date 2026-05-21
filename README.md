# Bar POS Community | Management Software for Associations, Motorcycle Clubs, Community Groups, and Bars

Web-based management software for associations, motorcycle clubs, community groups, recreational clubs, and community bars. This project works as a bar POS system, stock management system, member management tool, dues tracking platform, and merchandising admin system in a single application.

This project brings together:
- bar and merchandising sales
- tables and open orders
- products, stock, and stock movements
- members and dues payments
- admin and employee user roles
- operational reports

The goal is to stay simple to install, easy to use, and practical for small teams that need reliable software for the day-to-day work of a community space.

## Community Management Software

Bar POS Community was designed for organizations where management happens at the counter, at the tables, during events, in treasury work, and in daily interaction with members and visitors.

It is especially useful for:
- motorcycle clubs
- local associations
- community groups
- recreational clubs
- clubhouse bars
- merchandising stands at events

If someone is looking for association management software, motorcycle club software, a bar POS system, member management software, or a dues tracking platform, this project was built for exactly that kind of real-world use.

## Main Features

### Bar POS and Point of Sale
- fast counter sales
- payment method selection
- change calculation for cash payments
- receipt generation

### Tables
- open a table order
- add and update products
- close a table with payment
- cancel a table when needed

### Stock and Product Management
- manage bar and merchandising products
- categories by area
- product images
- low-stock alerts
- stock movement history

### Member and Dues Management
- member registration
- search by member number and name
- yearly dues payments
- payment history and cancellation

### Administration and Settings
- users and permissions
- brand configuration
- cancellation PIN
- default dues amount
- application language

## Relevant Search Keywords

This repository may be useful for people searching for:
- association management software
- motorcycle club software
- community group software
- bar POS system
- bar management software
- stock management for bars
- member management software
- dues management software
- merchandising management software
- recreational club management app

## Stack

- Node.js
- Express
- EJS
- MariaDB
- Docker Compose

## How to Install the Software

### 1. Clone the project

```bash
git clone <repo> bar-pos-community
cd bar-pos-community
```

### 2. Create the environment file

```bash
cp .env.example .env
```

You can edit `.env` before starting if you want to change ports, credentials, or other runtime settings.

### 3. Start the system with Docker

Recommended option:

```bash
docker compose -f docker-compose.yaml up -d --build --remove-orphans
```

Alternative option:

```bash
docker compose -f docker-compose.yml up -d --build --remove-orphans
```

### 4. Open the application in your browser

- Application: `http://localhost:8080`
- phpMyAdmin: `http://localhost:8081`

### 5. Stop the services

```bash
docker compose -f docker-compose.yaml down
```

## Default Login

For testing and first setup:

- Admin: `admin@bar.local` / `admin123`
- Employee: `funcionario@bar.local` / `funcionario123`

## Install Docker on Ubuntu

If Docker is not installed yet:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verification:

```bash
sudo docker version
sudo docker compose version
```

Optional, to use Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
```

Then log out and log back in so the `docker` group is applied.

## Project Structure

```text
.
├─ src/
│  ├─ server.js
│  ├─ db.js
│  ├─ i18n.js
│  └─ views/
├─ public/
│  ├─ css/
│  └─ js/
├─ scripts/init-db.js
├─ migrations/
├─ docker-compose.yaml
├─ docker-compose.yml
├─ Dockerfile
└─ package.json
```

## Data, Database, and Configuration

The system uses:
- MariaDB for persistent data
- database-backed sessions
- Docker volumes for uploads
- server-side brand configuration

Main variables in `.env`:
- `APP_PUBLIC_PORT`
- `SESSION_SECRET`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_PUBLIC_PORT`
- `PHPMYADMIN_PUBLIC_PORT`
- `UPLOAD_DIR`
- `ADMIN_CANCEL_PIN`

## Useful Commands

View logs:

```bash
docker compose -f docker-compose.yaml logs -f app
```

Stop everything:

```bash
docker compose -f docker-compose.yaml down
```

Remove volumes and start fresh:

```bash
docker compose -f docker-compose.yaml down -v
```

Run tests:

```bash
npm test
```

## Application Security

The project already includes a solid baseline for real-world use:
- hashed passwords
- secure `httpOnly` sessions
- separate permissions for admins and employees
- cancellation PIN protection
- baseline security headers with `helmet`
- image upload validation

## Open Source Project for the Community

This repository was designed to be useful in real operations while still being easy to maintain.

There is still plenty of room for the community to improve:
- documentation
- tests
- translations
- accessibility
- reports
- printer integrations
- UI improvements for events and mobile use

## How to Contribute

You can help in several ways:
- report bugs
- suggest improvements
- improve wording and translations
- review real-life usage flows for bars and associations
- implement new features

When contributing, try to keep the focus on:
- simplicity
- stability
- clarity for non-technical users
- a good experience on touch devices

## Project Summary

Bar POS Community is more than just a POS. It is community management software for bar sales, stock, members, dues, and merchandising, built for small teams that need a practical, simple, and collaborative solution.
