import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import InsightsPage from "./pages/InsightsPage";
import SessionsPage from "./pages/SessionsPage";
import ReportsPage from "./pages/ReportsPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/insights" element={<InsightsPage />} />
      <Route path="/sessions" element={<SessionsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
    </Routes>
  );
}

export default App;