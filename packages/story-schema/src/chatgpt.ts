/** Public connection status. Credentials are never part of this contract. */
export interface ChatGPTStatus {
  configured: boolean;
  pending: boolean;
  activeAccount: string | null;
  accounts: {
    id: string;
    label: string;
    connected: boolean;
    planEnabled: boolean;
  }[];
  error: string | null;
}
export interface ChatGPTModel {
  id: string;
  label: string;
}
