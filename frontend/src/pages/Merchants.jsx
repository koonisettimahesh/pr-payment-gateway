import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Merchants() {
  const navigate = useNavigate();

  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("provider_token");

    if (!token) {
      navigate("/provider/login");
      return;
    }

    async function loadMerchants() {
      try {
        const response = await fetch("http://localhost:8000/api/v1/merchants", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error?.description || "Failed to load merchants");
        }

        setMerchants(data.merchants || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadMerchants();
  }, [navigate]);

  return (
    <main>
      <h1>Merchants</h1>
      {loading && <p>Loading merchants...</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && merchants.length === 0 && <p>No merchants found.</p>}
      {!loading && merchants.length > 0 && (
        <ul>
          {merchants.map((merchant) => (
            <li key={merchant.id}>
              <strong>{merchant.name}</strong> ({merchant.email})
              <span> - {merchant.is_active ? "Active" : "Inactive"}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
