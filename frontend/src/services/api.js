import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rfq_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 (token expired/invalid) ─────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear session and redirect to login
      localStorage.removeItem("rfq_token");
      localStorage.removeItem("rfq_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ── Health check ─────────────────────────────────────────────────────────────
export const getHealth = async () => {
  const response = await api.get("/health");
  return response.data;
};

// ── RFQ endpoints ─────────────────────────────────────────────────────────────
export const getRFQs = async () => {
  const response = await api.get("/api/rfqs");
  return response.data;
};

export const getRFQById = async (id) => {
  const response = await api.get(`/api/rfq/${id}`);
  return response.data;
};

export const createRFQ = async (data) => {
  const response = await api.post("/api/rfq", data);
  return response.data;
};

// ── Bid endpoints ─────────────────────────────────────────────────────────────
export const placeBid = async (data) => {
  const response = await api.post("/api/bid", data);
  return response.data;
};

// ── User management (admin) ───────────────────────────────────────────────────
export const getUsers = async () => {
  const response = await api.get("/api/users");
  return response.data;
};

export const createUser = async (data) => {
  const response = await api.post("/api/users", data);
  return response.data;
};

export const updateUser = async (id, data) => {
  const response = await api.put(`/api/users/${id}`, data);
  return response.data;
};

export const deleteUser = async (id) => {
  const response = await api.delete(`/api/users/${id}`);
  return response.data;
};

export default api;
