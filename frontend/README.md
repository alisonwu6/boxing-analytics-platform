## Version Information

This project was developed and tested with the following versions:

### Frontend
- Node.js: v20.x
- npm: v10.x
- React: ^18.x
- Vite: ^5.x
- Tailwind CSS: ^3.x
- React Router DOM
- Lucide React

## Installation

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd boxing-analytics-platform
cd frontend
npm install

npm run dev

## Key Dependencies

### Frontend Dependencies
- `react` – used to build the user interface
- `react-router-dom` – used for page navigation
- `tailwindcss` – used for styling
- `lucide-react` – used for icons
- `vite` – used as the frontend build tool

### Backend Dependencies
- `express` – used to build the REST API server
- `prisma` – used as the ORM for database access
- `@prisma/client` – used to query the PostgreSQL database
- `dotenv` – used to load environment variables
- `jsonwebtoken` – used for authentication
- `multer` – used for handling file uploads if using multipart upload
- `aws-sdk` or `@aws-sdk/client-s3` – used for AWS S3 file upload
- `nodemon` – used for local backend development