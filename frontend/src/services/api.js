import axios from "axios";

const API_BASE_URL = "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Health check
export const getHealth = async () => {
  const response = await api.get("/health");
  return response.data;
};

// RFQ endpoints
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

// Bid endpoints
export const placeBid = async (data) => {
  const response = await api.post("/api/bid", data);
  return response.data;
};

export default api;
