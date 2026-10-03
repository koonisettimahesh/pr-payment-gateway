import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ProviderDashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("provider_token");

    if (!token) {
      navigate("/provider/login");
    }
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem("provider_token");
    localStorage.removeItem("provider_user");
    navigate("/provider/login");
  }

  return (
    <main>
      <h1>Provider Dashboard</h1>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </main>
  );
}
