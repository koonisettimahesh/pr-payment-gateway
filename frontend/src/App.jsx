import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Docs from "./pages/Docs";
import Webhooks from "./pages/Webhooks";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/transactions" element={<Transactions />} />
      <Route path="/dashboard/docs" element={<Docs />} />
      <Route path="/dashboard/webhooks" element={<Webhooks />} />

      {/* Fallback should NOT send to login */}
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}
