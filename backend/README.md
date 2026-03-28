## Setup

### Install dependencies

```bash
npm install
```

### Create your local `.env`


## Database Setup

Make sure PostgreSQL is running before starting the server.


Then generate the Prisma client:

```bash
npx prisma generate
```

Apply migrations:

```bash
npx prisma migrate dev
```

Expected local URL:

```txt
http://localhost:3001
```

## Health Check

Test:

```txt
GET /health
```

Open:

```txt
http://localhost:3001/health
```
