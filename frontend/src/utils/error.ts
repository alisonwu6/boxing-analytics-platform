import axios from "axios";

export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Request failed."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
};