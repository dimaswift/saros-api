# saros-api

REST API for the [saros-js](./saros-js) eclipse lookup library. Exposes solar and lunar eclipse lookup, Saros series navigation, octal phase calculation, and rollover epoch utilities over HTTP.

## Requirements

- Node.js 18 or later
- npm

---

## Ubuntu Deployment Guide

### 1. Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js 22 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v22.x.x
npm -v
```

### 3. Install Git and clone the repository

```bash
sudo apt install -y git
git clone <your-repo-url> /opt/saros-api
cd /opt/saros-api
```

### 4. Install dependencies

```bash
npm install --omit=dev
```

### 5. Configure environment

```bash
cp .env.example .env
nano .env
```

Set your values:

```
PORT=3000
API_KEYS=your-secret-key-1,your-secret-key-2
```

Save and close (`Ctrl+O`, `Enter`, `Ctrl+X`).

> Generate a strong key with: `openssl rand -hex 32`

### 6. Run the server manually (smoke test)

```bash
node server.js
```

In another terminal:

```bash
curl -H "X-API-Key: your-secret-key-1" http://localhost:3000/constants
```

You should receive a JSON response. Press `Ctrl+C` to stop.

### 7. Create a systemd service

Create the service file:

```bash
sudo nano /etc/systemd/system/saros-api.service
```

Paste the following (adjust `User` if needed):

```ini
[Unit]
Description=saros-api
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/saros-api
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable saros-api
sudo systemctl start saros-api
sudo systemctl status saros-api
```

### 8. (Optional) Reverse proxy with Nginx

Install Nginx:

```bash
sudo apt install -y nginx
```

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/saros-api
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable the site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/saros-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 9. (Optional) TLS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically update the Nginx config and set up auto-renewal.

---

## Useful commands

| Action | Command |
|--------|---------|
| View live logs | `sudo journalctl -u saros-api -f` |
| Restart service | `sudo systemctl restart saros-api` |
| Stop service | `sudo systemctl stop saros-api` |
| Reload after code change | `git pull && sudo systemctl restart saros-api` |

---

## Authentication

All endpoints require an API key. Pass it in the request header:

```
X-API-Key: your-secret-key
```

Or as a query parameter:

```
?api_key=your-secret-key
```

Multiple keys are supported (comma-separated in `.env`). A missing or invalid key returns HTTP 401.

---

## API Reference

All timestamps are Unix **seconds**. BigInt values are returned as strings.

### Constants

```
GET /constants
```

Returns all library constants: eclipse type maps, Saros lookup tables, average period, etc.

---

### Solar Eclipse Lookup

```
GET /eclipse/solar/next?timestamp=<unix_seconds>
GET /eclipse/solar/past?timestamp=<unix_seconds>
GET /eclipse/solar/closest?timestamp=<unix_seconds>
```

**Response:**
```json
{
  "eclipse":    { "unix_time": "1758483784", "global_index": 1972, "info": { "solar": { ... } }, "valid": 1 },
  "saros_prev": { ... },
  "saros_next": { ... }
}
```

`solar` info fields: `latitude_deg10`, `longitude_deg10`, `central_duration` (seconds; 65535 = n/a), `saros_number`, `saros_pos`, `ecl_type`, `sun_alt`.

---

### Lunar Eclipse Lookup

```
GET /eclipse/lunar/next?timestamp=<unix_seconds>
GET /eclipse/lunar/past?timestamp=<unix_seconds>
GET /eclipse/lunar/closest?timestamp=<unix_seconds>
```

`lunar` info fields: `pen_duration`, `par_duration`, `total_duration` (all seconds), `saros_number`, `saros_pos`, `ecl_type`.

---

### Saros Windows

```
GET /saros/solar/window?timestamp=<unix_seconds>&saros_number=<n>
GET /saros/lunar/window?timestamp=<unix_seconds>&saros_number=<n>
```

Returns the bounding eclipses (`past`, `future`) in the given Saros series around the timestamp.

---

### Saros Series

```
GET /saros/solar/series/:saros_number
```

Returns all eclipse timestamps in the given solar Saros series.

```
GET /saros/index/:number
```

Returns the index of a Saros series within the active series array (`-1` if not found).

---

### Saros Period Duration

```
GET /saros/solar/period/ms?timestamp=<unix_seconds>&saros_number=<n>&period=<p>
```

Returns the duration in milliseconds of a specific inter-eclipse period within a Saros series.

---

### Octal Phase

Quantizes a timestamp into a phase bin within a Saros cycle. `resolution` must be `1`, `2`, or `3`.

```
GET /octal/solar/phase?timestamp=<unix_seconds>&saros_number=<n>&resolution=<1|2|3>
GET /octal/solar/phase/ms?timestamp=<unix_ms>&saros_number=<n>&resolution=<1|2|3>
GET /octal/lunar/phase?timestamp=<unix_seconds>&saros_number=<n>&resolution=<1|2|3>
GET /octal/lunar/phase/ms?timestamp=<unix_ms>&saros_number=<n>&resolution=<1|2|3>
```

**Response:** `{ "result": "<bin>" }`

---

### Rollover Epoch

```
GET /rollover/solar?timestamp=<unix_seconds>&saros_number=<n>&bin=<bin>
```

Converts a bin number (0 to 16777215) back to a Unix timestamp within the surrounding Saros window.

**Response:** `{ "result": "<unix_seconds>" }`

---

### Average-Period Utilities

These use a fixed average Saros period (`568971789` seconds) instead of actual eclipse data.

```
GET /average/bin?reference=<unix_seconds>&timestamp=<unix_seconds>&scale=<n>&resolution=<1|2|3>
GET /average/rollover?reference=<unix_seconds>&timestamp=<unix_seconds>&bin=<bin>
```

**Response:** `{ "result": "<value>" }`
