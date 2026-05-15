# Boxing Analytics Frontend

Frontend web application for a boxing performance analysis platform.  
The application allows users to create training sessions, upload boxing data files, trigger analysis, and view performance insights through an interactive dashboard.

This README focuses on the frontend implementation and user-facing features.

---

## Overview

The Boxing Analytics frontend supports the main workflow of a boxing data analysis system.

Users can:

- Register and log in securely
- Create and manage training sessions
- Upload CSV and MOV files for analysis
- Track upload and analysis status
- View sensor-based insights from ML results
- View video analysis results when available
- Navigate between dashboard, sessions, uploads, and insights pages

The frontend is designed to connect with the backend API and present analysis results clearly for coaches, athletes, and project stakeholders.

---

## Setup

### 1. Prerequisites

Before running the frontend, make sure the following are installed:

- Node.js 18 or newer
- npm 9 or newer
- Git
- A running backend API server

Recommended versions:

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |
| React | 18+ |
| Vite | 5+ |
| TypeScript | 5+ |

---

### 2. Install dependencies

From the frontend project directory:

```bash
cd frontend
npm install
```

Main frontend dependencies include:

```bash
npm install react react-dom react-router-dom
npm install lucide-react
npm install recharts
npm install axios
npm install tailwindcss
```

Development dependencies may include:

```bash
npm install -D vite typescript eslint postcss autoprefixer
```

---

### 3. Environment variables

Create a `.env` file in the frontend directory.

```bash
VITE_API_BASE_URL=http://localhost:3001
```

Example structure:

```text
frontend/
├── .env
├── package.json
├── src/
└── vite.config.ts
```

The frontend uses this API base URL when sending requests to the backend.

---

### 4. Run the frontend locally

```bash
npm run dev
```

By default, the application should run at:

```text
http://localhost:5173
```

---

## Usage

Start the application:

```bash
npm run dev
```

Open the browser and go to:

```text
http://localhost:5173
```

---

## Main Pages

### Authentication

The application includes login and registration pages.

Main features:

- User registration
- User login
- JWT token storage
- Protected routes
- Redirect handling for unauthenticated users

---

### Dashboard Page

The dashboard provides a high-level overview of the application.

It helps users quickly access:

- Recent sessions
- Upload functions
- Analysis results
- Main navigation sections

---

### Sessions Page

The Sessions page allows users to create and manage boxing training sessions.

Main features:

- Create a new session
- View existing sessions
- Select a session
- Upload related data files
- Check session status
- Start analysis when files are ready

Typical session workflow:

```text
Create session
→ Upload file
→ Complete upload
→ Wait for ready status
→ Trigger analysis
→ View results
```

---

### Upload Function

The frontend supports file uploads through a session-based workflow.

Supported file types:

| File Type | Description |
|----------|-------------|
| `.csv` | IMU / sensor data file |
| `.mov` | Boxing video file |
| `.mp4` | Boxing video file, if supported by backend |
| `.avi` | Boxing video file, if supported by backend |

The upload flow is designed around pre-signed upload URLs.

General flow:

```text
1. Create or select a session
2. Request upload URL
3. Upload file
4. Complete upload
5. Wait for backend status update
```

---

## Insights Page

The Insights page displays boxing performance analysis results.

The page is separated into two major sections:

| Tab | Purpose |
|-----|---------|
| ML Insights | Shows analysis from CSV / sensor-based machine learning results |
| Video Analysis | Shows annotated video analysis results when available |

---

### ML Insights

The ML Insights section shows key performance data in a user-friendly dashboard.

Main metrics include:

- Total punches
- Punch rate
- Session duration
- Dominant punch type
- Average confidence
- Average peak acceleration

Visualisations may include:

- Punch type distribution
- Peak acceleration trend
- Forward vs retraction time comparison
- Confidence trend
- Punch event table
- Advanced insights summary

The purpose of this page is not only to show raw data, but also to help users understand boxing performance patterns.

Example user insights:

```text
This session was jab-heavy.
Power decreased toward the end of the session.
Retraction time was slower than forward punch time.
Confidence remained stable across most punch events.
```

---

### Video Analysis

The Video Analysis tab is reserved for displaying video-based analysis results.

Expected video analysis outputs may include:

- Annotated boxing video
- Skeleton overlay
- Punch phase overlay
- Punch timing information
- Optional IMU acceleration visualisation
- Video analysis summary

Current note:

At this stage, the frontend includes the structure for video analysis display.  
However, complete video analysis visualisation depends on backend API support and available video result data.

---

## Current Limitation

The frontend is designed to support both CSV-based ML analysis and video-based analysis.

However, the current backend API does not yet fully support separate left-hand and right-hand upload handling for video analysis.

Because of this limitation:

- The frontend can prepare the layout for video analysis
- The frontend can show available video results when returned by the API
- Full left-hand and right-hand separated video analysis cannot be fully displayed yet
- Future API updates are required to support complete video-based comparison

This limitation is handled in the frontend by keeping the ML and Video analysis sections separated.

---

## Project Structure

```text
frontend/
├── public/
│   └── assets/
│
├── src/
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── common UI components
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── SessionsPage.tsx
│   │   └── InsightsPage.tsx
│   │
│   ├── services/
│   │   └── api.ts
│   │
│   ├── types/
│   │   └── session types and result types
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── .env
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Frontend Pipeline

The frontend workflow follows this process:

1. **User Authentication**  
   The user logs in or registers through the authentication pages.

2. **Protected Route Access**  
   After login, the token is stored and used to access protected frontend pages.

3. **Session Creation**  
   The user creates a boxing training session.

4. **File Upload**  
   The user uploads CSV or video files to the selected session.

5. **Upload Completion**  
   The frontend confirms upload completion with the backend.

6. **Analysis Trigger**  
   Once the session is ready, the user can start analysis.

7. **Status Polling**  
   The frontend checks analysis progress and session status.

8. **Result Display**  
   The Insights page displays ML results and video results when available.

---

## API Connection

The frontend connects to the backend API through an API service file.

Example API base configuration:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
```

Common API actions include:

| Action | Purpose |
|--------|---------|
| Login | Authenticate user |
| Register | Create user account |
| Create session | Start a new boxing session |
| Get sessions | Display existing sessions |
| Upload file | Upload CSV or MOV file |
| Complete upload | Confirm file upload |
| Start analysis | Trigger ML or video analysis |
| Get status | Check analysis progress |
| Get results | Display insights |

---

## Key Features

### User Interface

- Clean dashboard layout
- Navigation bar
- Protected pages
- Responsive design
- Clear loading and error states
- Separate ML and Video tabs

### Upload Experience

- Session-based file upload
- CSV and MOV upload support
- Upload progress handling
- File type validation
- Status-based analysis button

### Insights Visualisation

- Summary cards
- Charts and trends
- Punch event table
- Advanced insight display
- Separate ML and Video result sections

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run linting checks |

Example:

```bash
npm run build
```

---

## Build

To create a production build:

```bash
npm run build
```

The output will be generated in:

```text
dist/
```

To preview the build locally:

```bash
npm run preview
```

---

## Deployment

The frontend can be deployed to platforms such as:

- AWS Amplify
- Netlify
- Vercel
- Static web hosting service

Before deployment, make sure the production API base URL is correctly configured.

Example production environment variable:

```bash
VITE_API_BASE_URL=https://your-api-domain.com
```

---

## Troubleshooting

### Frontend cannot connect to backend

Check that the backend server is running and the `.env` file contains the correct API URL.

```bash
VITE_API_BASE_URL=http://localhost:3001
```

---

### Login works locally but not after deployment

Check:

- API base URL
- CORS settings
- Token storage
- Deployment environment variables

---

### Uploaded file does not appear in session

Check:

- Session ID is correct
- Upload complete endpoint was called
- File type is supported
- Backend session status has updated

---

### Insights page shows no data

Check:

- Analysis has been triggered
- Session status is complete
- Results endpoint returns data
- ML result structure matches frontend expectations

---

## Notes for Future Development

Planned improvements include:

- Full video analysis result display
- Separate left-hand and right-hand video upload support
- More detailed punch comparison charts
- Better error messages for failed analysis
- Improved loading states during long analysis
- Exportable analysis report
- Coach-friendly recommendation section

---

## Summary

This frontend provides the user-facing interface for the Boxing Analytics platform.

It supports the main workflow from session creation to file upload and insight display.  
The current version focuses on clear navigation, upload handling, ML insight visualisation, and preparation for future video analysis integration.
